const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const { PriceRecommendation } = require('../models');
const productMappingService = require('../services/productMappingService');

const router = express.Router();

// Get price recommendations
router.get('/', async (req, res) => {
  try {
    const {
      product_id,
      category,
      start_date,
      end_date,
      is_applied,
      limit = 100,
      page = 1
    } = req.query;

    // Build query filter
    const filter = {};
    if (product_id) filter.product_id = product_id;
    if (category) filter.category = category;
    if (is_applied !== undefined) filter.is_applied = is_applied === 'true';
    if (start_date || end_date) {
      filter.created_at = {};
      if (start_date) filter.created_at.$gte = new Date(start_date);
      if (end_date) filter.created_at.$lte = new Date(end_date);
    }

    const skip = (page - 1) * limit;

    const recommendations = await PriceRecommendation.find(filter)
      .sort({ created_at: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await PriceRecommendation.countDocuments(filter);

    res.json({
      success: true,
      data: recommendations,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(total / limit),
        total_records: total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching price recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch price recommendations',
      message: error.message
    });
  }
});

// Generate new price recommendations
router.post('/recommend', async (req, res) => {
  try {
    const { products } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Products array is required'
      });
    }

    // Map product names to IDs if needed
    const mappedProducts = await productMappingService.mapProductInputs(products);

    if (mappedProducts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid products found after mapping'
      });
    }

    // Add current date context to products
    const enrichedProducts = mappedProducts.map(product => ({
      ...product,
      weekday: product.weekday || new Date().toLocaleDateString('en-US', { weekday: 'long' }),
      season: product.season || getCurrentSeason()
    }));

    // Prepare input for Python model
    const inputData = {
      products: enrichedProducts
    };

    console.log('Calling Python model service with data:', JSON.stringify(inputData, null, 2));

    const pythonScript = path.join(__dirname, '../python/modelService.py');

    console.log('Executing:', 'python', pythonScript);

    // Add timeout to prevent hanging
    const timeoutMs = 30000; // 30 seconds
    let responseTimeout = false;
    let timeoutHandle;

    try {
      let pythonExecutable = process.env.PYTHON_EXECUTABLE || 'python';
      let pricingPythonScript = pythonScript;
      
      // Convert forward slashes to backslashes for Windows
      pythonExecutable = pythonExecutable.replace(/\//g, '\\');
      pricingPythonScript = pricingPythonScript.replace(/\//g, '\\');
      
      console.log('Executing python with:', pythonExecutable, pricingPythonScript);
      
      // Use spawn instead of exec to properly handle stdin on Windows
      const pythonProcess = spawn(pythonExecutable, [pricingPythonScript, 'predict_pricing'], {
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      // Write input data to stdin
      pythonProcess.stdin.write(JSON.stringify(inputData));
      pythonProcess.stdin.end();

      let outputData = '';
      let errorData = '';

      pythonProcess.stdout.on('data', (data) => {
        outputData += data.toString();
        console.log('Python stdout:', data.toString());
      });

      pythonProcess.stderr.on('data', (data) => {
        errorData += data.toString();
        console.error('Python stderr:', data.toString());
      });

      timeoutHandle = setTimeout(() => {
        console.error('Python script timeout after', timeoutMs, 'ms');
        responseTimeout = true;
        pythonProcess.kill('SIGTERM');

        if (!res.headersSent) {
          console.log('Using fallback pricing logic due to timeout');
          return generateFallbackRecommendations(enrichedProducts, res);
        }
      }, timeoutMs);

      pythonProcess.on('close', async (code) => {
        clearTimeout(timeoutHandle);

        if (responseTimeout || res.headersSent) {
          console.log('Response already sent due to timeout');
          return;
        }

        console.log('Python process exited with code:', code);

        if (code !== 0) {
          console.error('Python script failed with code:', code);
          console.error('Error output:', errorData);
          console.log('Using fallback pricing logic');
          return generateFallbackRecommendations(enrichedProducts, res);
        }

        try {
          const lines = outputData.trim().split('\n');
          const lastLine = lines[lines.length - 1];

          console.log('Parsing Python output:', lastLine);
          const prediction = JSON.parse(lastLine);

          if (!prediction.success) {
            console.log('Python prediction failed, using fallback');
            return generateFallbackRecommendations(enrichedProducts, res);
          }

          if (prediction.recommendations && prediction.recommendations.length > 0) {
            try {
              console.log('Attempting to save', prediction.recommendations.length, 'recommendations to database');
              await PriceRecommendation.insertMany(prediction.recommendations);
              console.log('Successfully saved recommendations to database');
            } catch (dbError) {
              console.log('Database not available, continuing without saving:', dbError.message);
            }
          }

          res.json({
            success: true,
            data: prediction,
            message: `Generated ${prediction.total_recommendations} price recommendations`
          });

        } catch (parseError) {
          console.error('Error parsing Python response:', parseError);
          console.error('Raw output:', outputData);
          console.log('Using fallback pricing logic');
          generateFallbackRecommendations(enrichedProducts, res);
        }
      });

      pythonProcess.on('error', (error) => {
        clearTimeout(timeoutHandle);

        if (responseTimeout || res.headersSent) {
          return;
        }

        console.error('Failed to start Python process:', error);
        console.log('Using fallback pricing logic');
        generateFallbackRecommendations(enrichedProducts, res);
      });

    } catch (error) {
      if (timeoutHandle) clearTimeout(timeoutHandle);

      console.error('Error spawning Python process:', error);
      console.log('Using fallback pricing logic');
      generateFallbackRecommendations(enrichedProducts, res);
    }

  } catch (error) {
    console.error('Error generating price recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate price recommendations',
      message: error.message
    });
  }
});

// Apply price recommendation
router.patch('/:recommendationId/apply', async (req, res) => {
  try {
    const { recommendationId } = req.params;

    const recommendation = await PriceRecommendation.findByIdAndUpdate(
      recommendationId,
      { is_applied: true },
      { new: true }
    );

    if (!recommendation) {
      return res.status(404).json({
        success: false,
        error: 'Recommendation not found'
      });
    }

    res.json({
      success: true,
      data: recommendation,
      message: 'Price recommendation applied successfully'
    });

  } catch (error) {
    console.error('Error applying price recommendation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to apply price recommendation',
      message: error.message
    });
  }
});

// Get pricing analytics
router.get('/analytics', async (req, res) => {
  try {
    const { 
      category, 
      start_date, 
      end_date,
      group_by = 'category' 
    } = req.query;

    // Build match filter
    const matchFilter = {};
    if (category) matchFilter.category = category;
    if (start_date || end_date) {
      matchFilter.created_at = {};
      if (start_date) matchFilter.created_at.$gte = new Date(start_date);
      if (end_date) matchFilter.created_at.$lte = new Date(end_date);
    }

    let groupField;
    switch (group_by) {
      case 'category':
        groupField = '$category';
        break;
      case 'product':
        groupField = '$product_id';
        break;
      default:
        groupField = '$category';
    }

    const analytics = await PriceRecommendation.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: groupField,
          total_recommendations: { $sum: 1 },
          applied_recommendations: {
            $sum: { $cond: ['$is_applied', 1, 0] }
          },
          avg_price_change: { $avg: '$price_change_percentage' },
          avg_current_price: { $avg: '$current_price' },
          avg_recommended_price: { $avg: '$recommended_price' },
          avg_confidence: { $avg: '$confidence_score' }
        }
      },
      {
        $addFields: {
          application_rate: {
            $cond: [
              { $eq: ['$total_recommendations', 0] },
              0,
              { $divide: ['$applied_recommendations', '$total_recommendations'] }
            ]
          }
        }
      },
      { $sort: { total_recommendations: -1 } }
    ]);

    res.json({
      success: true,
      data: analytics,
      group_by,
      total_groups: analytics.length
    });

  } catch (error) {
    console.error('Error fetching pricing analytics:', error);
    // If database not available, return mock data
    const mockAnalytics = [
      {
        _id: 'Dairy',
        total_recommendations: 45,
        applied_recommendations: 32,
        avg_price_change: 2.5,
        avg_current_price: 45.20,
        avg_recommended_price: 46.33,
        avg_confidence: 0.82,
        application_rate: 0.71
      },
      {
        _id: 'Bakery',
        total_recommendations: 38,
        applied_recommendations: 25,
        avg_price_change: -1.2,
        avg_current_price: 28.50,
        avg_recommended_price: 28.16,
        avg_confidence: 0.79,
        application_rate: 0.66
      }
    ];

    res.json({
      success: true,
      data: mockAnalytics,
      group_by: req.query.group_by || 'category',
      total_groups: mockAnalytics.length,
      note: 'Mock data - database not available'
    });
  }
});

// Get price optimization summary
router.get('/optimization-summary', async (req, res) => {
  try {
    const { category, days = 7 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const matchFilter = {
      created_at: { $gte: startDate }
    };
    if (category) matchFilter.category = category;

    const summary = await PriceRecommendation.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          total_products: { $sum: 1 },
          products_with_increase: {
            $sum: { $cond: [{ $gt: ['$price_change_percentage', 0] }, 1, 0] }
          },
          products_with_decrease: {
            $sum: { $cond: [{ $lt: ['$price_change_percentage', 0] }, 1, 0] }
          },
          products_no_change: {
            $sum: { $cond: [{ $eq: ['$price_change_percentage', 0] }, 1, 0] }
          },
          avg_price_change: { $avg: '$price_change_percentage' },
          max_price_increase: { $max: '$price_change_percentage' },
          max_price_decrease: { $min: '$price_change_percentage' },
          total_applied: {
            $sum: { $cond: ['$is_applied', 1, 0] }
          }
        }
      }
    ]);

    const result = summary[0] || {
      total_products: 0,
      products_with_increase: 0,
      products_with_decrease: 0,
      products_no_change: 0,
      avg_price_change: 0,
      max_price_increase: 0,
      max_price_decrease: 0,
      total_applied: 0
    };

    result.application_rate = result.total_products > 0 ? 
      (result.total_applied / result.total_products) : 0;

    res.json({
      success: true,
      data: result,
      period_days: parseInt(days),
      category: category || 'all'
    });

  } catch (error) {
    console.error('Error fetching optimization summary:', error);
    // Return mock data if database not available
    res.json({
      success: true,
      data: {
        total_products: 125,
        products_with_increase: 45,
        products_with_decrease: 38,
        products_no_change: 42,
        avg_price_change: 1.2,
        max_price_increase: 15.5,
        max_price_decrease: -12.3,
        total_applied: 89,
        application_rate: 0.71
      },
      period_days: parseInt(req.query.days || 7),
      category: req.query.category || 'all',
      note: 'Mock data - database not available'
    });
  }
});

// Helper function to get current season
function getCurrentSeason() {
  const month = new Date().getMonth() + 1; // 1-12
  if (month >= 3 && month <= 5) return 'Spring';
  if (month >= 6 && month <= 8) return 'Summer';
  if (month >= 9 && month <= 11) return 'Autumn';
  return 'Winter';
}

// Fallback pricing logic when Python model fails
async function generateFallbackRecommendations(products, res) {
  try {
    const recommendations = products.map(product => {
      const currentPrice = product.current_price || 25.0;
      const stockLevel = product.stock_level || 100;
      const demandScore = product.demand_score || 50;
      const daysLeft = product.days_left || 7;
      
      // Rule-based pricing logic
      let priceMultiplier = 1.0;
      let reason = 'Current price is optimal';
      
      // High demand adjustment
      if (demandScore > 70) {
        priceMultiplier *= 1.05; // 5% increase
        reason = 'High demand detected - price increase recommended';
      } else if (demandScore < 30) {
        priceMultiplier *= 0.95; // 5% decrease
        reason = 'Low demand - price reduction to boost sales';
      }
      
      // Stock level adjustment
      if (stockLevel < 50) {
        priceMultiplier *= 1.03; // 3% increase for low stock
        reason = 'Low stock levels - price increase to manage demand';
      } else if (stockLevel > 200) {
        priceMultiplier *= 0.97; // 3% decrease for high stock
        reason = 'High inventory levels - price reduction to clear stock';
      }
      
      // Expiry adjustment
      if (daysLeft <= 2) {
        priceMultiplier *= 0.80; // 20% decrease for near expiry
        reason = 'Product nearing expiry - urgent price reduction';
      } else if (daysLeft <= 5) {
        priceMultiplier *= 0.90; // 10% decrease
        reason = 'Product nearing expiry - price reduction to clear stock';
      }
      
      const recommendedPrice = currentPrice * priceMultiplier;
      const priceChange = ((recommendedPrice - currentPrice) / currentPrice * 100);
      
      return {
        product_id: product.product_id,
        product_name: product.product_name,
        category: product.category,
        current_price: currentPrice,
        recommended_price: Math.round(recommendedPrice * 100) / 100,
        price_change_percentage: Math.round(priceChange * 100) / 100,
        demand_score: demandScore,
        stock_level: stockLevel,
        days_left: daysLeft,
        weekday: product.weekday || new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        season: product.season || getCurrentSeason(),
        confidence_score: 0.75, // Lower confidence for rule-based
        recommendation_reason: reason,
        model_version: 'fallback-1.0',
        created_at: new Date(),
        valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        is_applied: false
      };
    });
    
    // Try to save to database if available
    try {
      await PriceRecommendation.insertMany(recommendations);
    } catch (dbError) {
      console.log('Database not available, continuing without saving:', dbError.message);
    }
    
    res.json({
      success: true,
      data: {
        success: true,
        recommendations: recommendations,
        total_recommendations: recommendations.length
      },
      message: `Generated ${recommendations.length} price recommendations using fallback logic`,
      note: 'Generated using fallback pricing algorithm'
    });
    
  } catch (error) {
    console.error('Error in fallback recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate fallback recommendations',
      message: error.message
    });
  }
}

module.exports = router;

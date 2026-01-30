const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const { DemandForecast } = require('../models');
const productMappingService = require('../services/productMappingService');

const router = express.Router();

// Test DemandForecast model on route initialization
console.log('DemandForecast model check:', {
  modelExists: !!DemandForecast,
  modelName: DemandForecast?.modelName,
  collection: DemandForecast?.collection?.name
});

// Get demand forecasts
router.get('/', async (req, res) => {
  try {
    const {
      product_id,
      city,
      category,
      start_date,
      end_date,
      limit = 100,
      page = 1
    } = req.query;

    // Build query filter
    const filter = {};
    if (product_id) filter.product_id = product_id;
    if (city) filter.city = city;
    if (category) filter.category = category;
    if (start_date || end_date) {
      filter.forecast_date = {};
      if (start_date) filter.forecast_date.$gte = new Date(start_date);
      if (end_date) filter.forecast_date.$lte = new Date(end_date);
    }

    const skip = (page - 1) * limit;

    const forecasts = await DemandForecast.find(filter)
      .sort({ forecast_date: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await DemandForecast.countDocuments(filter);

    res.json({
      success: true,
      data: forecasts,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(total / limit),
        total_records: total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching demand forecasts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch demand forecasts',
      message: error.message
    });
  }
});

// Generate new demand forecasts
router.post('/predict', async (req, res) => {
  try {
    const { products, forecast_days = 7, cities } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Products array is required'
      });
    }

    // Map product names to IDs if needed with timeout protection
    let mappedProducts;
    try {
      console.log('Starting product mapping for', products.length, 'products');
      const mappingStart = Date.now();
      
      mappedProducts = await Promise.race([
        productMappingService.mapProductInputs(products),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Product mapping timeout')), 5000)
        )
      ]);
      
      const mappingEnd = Date.now();
      console.log('Product mapping completed in', mappingEnd - mappingStart, 'ms');
      
    } catch (error) {
      console.error('Product mapping failed:', error.message);
      return res.status(400).json({
        success: false,
        error: 'Product mapping failed',
        message: error.message
      });
    }

    if (mappedProducts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid products found after mapping'
      });
    }

    // Prepare input for Python model
    const inputData = {
      products: mappedProducts,
      forecast_days,
      cities
    };

    // Call Python model service using child_process
    console.log('Calling Python model service with data:', JSON.stringify(inputData, null, 2));
    
    let pythonScript = path.join(__dirname, '../python/modelService.py');
    const inputJson = JSON.stringify(inputData);
    
    console.log('Executing python script with input length:', inputJson.length);
    
    // Increase timeout and improve process handling
    const timeoutMs = 60000; // 60 seconds
    let responseTimeout = false;
    let timeoutHandle;
    
    try {
      // Use stdin to pass data instead of command line arguments to avoid JSON parsing issues
      let pythonExecutable = process.env.PYTHON_EXECUTABLE || 'python';
      // Convert forward slashes to backslashes for Windows
      pythonExecutable = pythonExecutable.replace(/\//g, '\\');
      pythonScript = pythonScript.replace(/\//g, '\\');
      
      console.log('Executing python with:', pythonExecutable, pythonScript);
      
      // Use spawn instead of exec to properly handle stdin on Windows
      const pythonProcess = spawn(pythonExecutable, [pythonScript, 'predict_demand'], {
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      
      let outputData = '';
      let errorData = '';
      let dataReceived = false;
      
      // Write input data to stdin
      pythonProcess.stdin.write(inputJson);
      pythonProcess.stdin.end();
      
      pythonProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        outputData += chunk;
        dataReceived = true;
        console.log('Python stdout chunk received:', chunk.length, 'bytes');
      });
      
      pythonProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        errorData += chunk;
        console.log('Python stderr:', chunk);
      });
      
      // Set timeout
      timeoutHandle = setTimeout(() => {
        console.error('Python script timeout after', timeoutMs, 'ms');
        console.error('Data received so far:', dataReceived);
        console.error('Output length:', outputData.length);
        console.error('Error length:', errorData.length);
        
        responseTimeout = true;
        pythonProcess.kill('SIGKILL'); // Force kill
        
        if (!res.headersSent) {
          return res.status(500).json({
            success: false,
            error: 'Model prediction timeout',
            message: `Python script execution exceeded time limit (${timeoutMs}ms)`,
            debug: {
              dataReceived,
              outputLength: outputData.length,
              errorLength: errorData.length
            }
          });
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
          return res.status(500).json({
            success: false,
            error: 'Model prediction failed',
            message: `Python script exited with code ${code}: ${errorData}`
          });
        }
        
        try {
          // Parse the last line of output (which should be the JSON result)
          const lines = outputData.trim().split('\n');
          const lastLine = lines[lines.length - 1];
          
          console.log('Parsing Python output:', lastLine);
          const prediction = JSON.parse(lastLine);
          
          if (!prediction.success) {
            return res.status(500).json({
              success: false,
              error: 'Model prediction failed',
              message: prediction.error
            });
          }
          
          // Save predictions to database (if MongoDB is connected)
          if (prediction.predictions && prediction.predictions.length > 0) {
            try {
              console.log('Attempting to save', prediction.predictions.length, 'predictions to database');
              console.log('Sample prediction data:', JSON.stringify(prediction.predictions[0], null, 2));
              
              // Convert forecast_date from string to Date object
              const processedPredictions = prediction.predictions.map(pred => ({
                ...pred,
                forecast_date: new Date(pred.forecast_date)
              }));
              
              console.log('Sample processed prediction:', JSON.stringify(processedPredictions[0], null, 2));
              
              // Validate each prediction before saving
              for (let i = 0; i < processedPredictions.length; i++) {
                const pred = processedPredictions[i];
                console.log(`Validating prediction ${i + 1}:`, {
                  product_id: pred.product_id,
                  product_name: pred.product_name,
                  category: pred.category,
                  city: pred.city,
                  forecast_date: pred.forecast_date,
                  forecast_date_type: typeof pred.forecast_date,
                  predicted_units: pred.predicted_units,
                  predicted_units_type: typeof pred.predicted_units
                });
                
                // Create a test instance to check validation
                try {
                  const testForecast = new DemandForecast(pred);
                  const validationError = testForecast.validateSync();
                  if (validationError) {
                    console.error(`Validation error for prediction ${i + 1}:`, validationError.errors);
                  } else {
                    console.log(`Prediction ${i + 1} validation passed`);
                  }
                } catch (validationError) {
                  console.error(`Error creating test forecast for prediction ${i + 1}:`, validationError);
                }
              }
              
              const result = await DemandForecast.insertMany(processedPredictions);
              console.log('Successfully saved', result.length, 'predictions to database');
            } catch (dbError) {
                console.error('Database error details:', {
                  message: dbError.message,
                  name: dbError.name,
                  code: dbError.code,
                  errors: dbError.errors
                });
                console.error('Failed to save the demand forecasts:', dbError);
            }
          } else {
            console.log('No predictions to save to database');
          }
          
          res.json({
            success: true,
            data: prediction,
            message: `Generated ${prediction.total_predictions} demand forecasts`
          });
          
        } catch (parseError) {
          console.error('Error parsing Python response:', parseError);
          console.error('Raw output:', outputData);
          res.status(500).json({
            success: false,
            error: 'Failed to parse model response',
            message: parseError.message,
            raw_output: outputData
          });
        }
      });
      
      pythonProcess.on('error', (error) => {
        clearTimeout(timeoutHandle);
        
        if (responseTimeout || res.headersSent) {
          return;
        }
        
        console.error('Failed to start Python process:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to start Python process',
          message: error.message
        });
      });
      
    } catch (error) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      
      console.error('Error spawning Python process:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute Python script',
        message: error.message
      });
    }

  } catch (error) {
    console.error('Error generating demand forecast:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate demand forecast',
      message: error.message
    });
  }
});

// Get demand analytics
router.get('/analytics', async (req, res) => {
  try {
    const { 
      category, 
      city, 
      start_date, 
      end_date,
      group_by = 'category' 
    } = req.query;

    // Build match filter
    const matchFilter = {};
    if (category) matchFilter.category = category;
    if (city) matchFilter.city = city;
    if (start_date || end_date) {
      matchFilter.forecast_date = {};
      if (start_date) matchFilter.forecast_date.$gte = new Date(start_date);
      if (end_date) matchFilter.forecast_date.$lte = new Date(end_date);
    }

    // Modified aggregation to show day-wise predictions by category
    const analytics = await DemandForecast.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: {
            category: '$category',
            day_of_week: '$day_of_week'
          },
          predicted_units: { $sum: '$predicted_units' },
          forecast_count: { $sum: 1 },
          avg_confidence: { $avg: '$confidence_score' }
        }
      },
      {
        $group: {
          _id: '$_id.category',
          daily_predictions: {
            $push: {
              day: '$_id.day_of_week',
              predicted_units: '$predicted_units',
              forecast_count: '$forecast_count',
              avg_confidence: '$avg_confidence'
            }
          },
          total_predicted_units: { $sum: '$predicted_units' },
          total_forecasts: { $sum: '$forecast_count' }
        }
      },
      {
        $project: {
          _id: 1,
          total_predicted_units: 1,
          total_forecasts: 1,
          average_predicted_units: { $divide: ['$total_predicted_units', '$total_forecasts'] },
          daily_predictions: {
            $arrayToObject: {
              $map: {
                input: '$daily_predictions',
                as: 'day_data',
                in: {
                  k: '$$day_data.day',
                  v: {
                    predicted_units: '$$day_data.predicted_units',
                    forecast_count: '$$day_data.forecast_count',
                    avg_confidence: '$$day_data.avg_confidence'
                  }
                }
              }
            }
          }
        }
      },
      { $sort: { total_predicted_units: -1 } }
    ]);

    res.json({
      success: true,
      data: analytics,
      group_by: 'category_with_days',
      total_groups: analytics.length
    });
    

  } catch (error) {
    console.error('Error fetching demand analytics:', error);
    // If database not available, return mock data
    const mockAnalytics = [
      {
        _id: 'Dairy',
        total_predicted_units: 2500,
        average_predicted_units: 75,
        forecast_count: 35,
        avg_confidence: 0.85
      },
      {
        _id: 'Bakery',
        total_predicted_units: 1800,
        average_predicted_units: 60,
        forecast_count: 30,
        avg_confidence: 0.82
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

// Delete old forecasts
router.delete('/cleanup', async (req, res) => {
  try {
    const { days_old = 30 } = req.query;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days_old));

    const result = await DemandForecast.deleteMany({
      created_at: { $lt: cutoffDate }
    });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} old forecast records`,
      deleted_count: result.deletedCount
    });

  } catch (error) {
    console.error('Error cleaning up forecasts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup old forecasts',
      message: error.message
    });
  }
});

module.exports = router;

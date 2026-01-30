const mongoose = require('mongoose');

// Import all models
const City = require('./City');
const DemandForecast = require('./DemandForecast');
const ProductSchema = require('./Product');
const PriceRecommendationSchema = require('./PriceRecommendation');

// Initialize models
const Product = ProductSchema(mongoose);
const PriceRecommendation = PriceRecommendationSchema(mongoose);

module.exports = {
  City,
  Product,
  DemandForecast,
  PriceRecommendation,
};

# SmartMandi 🌾

A comprehensive smart agriculture marketplace solution that combines Machine Learning models for demand forecasting and dynamic pricing with a full-stack web application for farmers and buyers.

## 🎯 Overview

SmartMandi is an intelligent agricultural marketplace platform designed to revolutionize how farmers and buyers interact in the agricultural ecosystem. The platform leverages advanced ML models to provide accurate demand forecasting and dynamic pricing, helping farmers maximize their profits while ensuring fair market prices.

## 🏗️ Project Structure

```
SmartMandi/
├── Dataset_CSV_Files/           # Training datasets for ML models
│   ├── demand_forecasting_data.csv
│   └── dynamic_pricing_data.csv
├── Model_for_Demand_Forecasting/ # ML model for demand prediction
│   ├── Demand_Forecasting_Model.ipynb
│   ├── autos_model.pkl
│   └── demand_forecasting_data.csv
├── Model_for_Dynamic_Pricing/   # ML model for price optimization
│   ├── Dynamic_Pricing_Model.ipynb
│   ├── xgb_model.pkl
│   ├── model_features.json
│   └── dynamic_pricing_data.csv
├── smartmandi_backend/          # Backend API server
├── smartmandi_frontend/         # React frontend application
├── package.json                 # Root dependencies
├── seed.js                      # Database seeding script
└── seedCities.js               # City data seeding script
```

## 🚀 Features

### Machine Learning Models
- **Demand Forecasting**: Uses AutoTS (Automated Time Series) for predicting agricultural product demand
- **Dynamic Pricing**: Implements XGBoost algorithm for optimal price prediction based on market conditions
- **Data Analysis**: Comprehensive EDA (Exploratory Data Analysis) and visualizations

### Web Application
- **Frontend**: Modern React.js application with responsive design
- **Backend**: Node.js/Express API server
- **Database**: MongoDB for data persistence
- **Charts**: Interactive data visualization using Recharts

### Key Functionalities
- Real-time demand forecasting for agricultural products
- Dynamic pricing based on market conditions
- User-friendly marketplace interface
- Data visualization and analytics dashboard
- Farmer and buyer management system

## 🛠️ Technologies Used

### Machine Learning & Data Science
- **Python**: Core ML development
- **AutoTS**: Automated time series forecasting
- **XGBoost**: Gradient boosting for pricing models
- **Pandas & NumPy**: Data manipulation and analysis
- **Matplotlib & Seaborn**: Data visualization
- **Scikit-learn**: Machine learning utilities

### Backend
- **Node.js**: Server runtime
- **Express.js**: Web framework
- **MongoDB**: Database
- **Mongoose**: MongoDB object modeling

### Frontend
- **React.js**: UI framework
- **Recharts**: Data visualization library
- **Redux Toolkit**: State management
- **CSS**: Styling

## 📊 Machine Learning Models

### 1. Demand Forecasting Model
- **Algorithm**: AutoTS (Automated Time Series)
- **Purpose**: Predict future demand for agricultural products
- **Features**: Historical sales data, seasonal patterns, market trends
- **Output**: Demand forecasts with confidence intervals

### 2. Dynamic Pricing Model
- **Algorithm**: XGBoost (Extreme Gradient Boosting)
- **Purpose**: Optimize pricing strategies based on market conditions
- **Features**: Supply levels, demand forecasts, competitor pricing, seasonal factors
- **Output**: Optimal price recommendations

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- Python (v3.8 or higher)
- MongoDB
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/NitishDwi07/SmartMandis.git
   cd SmartMandis
   ```

2. **Install root dependencies**
   ```bash
   npm install
   ```

3. **Setup Backend**
   ```bash
   cd smartmandi_backend
   npm install
   cp .env.example .env  # Configure your environment variables
   npm start
   ```

4. **Setup Frontend**
   ```bash
   cd ../smartmandi_frontend
   npm install
   npm start
   ```

5. **Setup ML Models**
   ```bash
   # Navigate to model directories and run Jupyter notebooks
   cd ../Model_for_Demand_Forecasting
   jupyter notebook Demand_Forecasting_Model.ipynb
   
   cd ../Model_for_Dynamic_Pricing
   jupyter notebook Dynamic_Pricing_Model.ipynb
   ```

### Environment Configuration

Create `.env` files in the backend directory with the following variables:
```env
MONGODB_URI=mongodb://localhost:27017/smartmandi
PORT=5000
JWT_SECRET=your_jwt_secret
NODE_ENV=development
```

## 📈 Usage

1. **Start the Backend Server**: The API server runs on `http://localhost:5000`
2. **Launch the Frontend**: The React app runs on `http://localhost:3000`
3. **Access ML Models**: Use Jupyter notebooks for model training and analysis
4. **Seed Database**: Run `node seed.js` to populate initial data

## 🤝 Contributing

We welcome contributions to SmartMandi! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/AmazingFeature`)
3. **Make your changes** and add tests if applicable
4. **Commit your changes** (`git commit -m 'Add some AmazingFeature'`)
5. **Push to the branch** (`git push origin feature/AmazingFeature`)
6. **Open a Pull Request**

### Development Guidelines
- Follow existing code style and conventions
- Add comments for complex logic
- Update documentation for new features
- Test your changes thoroughly
- Keep commits atomic and descriptive

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Team

- **Mridul Gupta** - Project Lead & ML Engineer
- **Aahona Mukhopadhyay**-
  
- 
## 🎯 Future Enhancements

- [ ] Mobile application development
- [ ] Advanced ML models (LSTM, Prophet)
- [ ] Real-time price alerts
- [ ] Weather data integration
- [ ] Multilingual support
- [ ] Payment gateway integration
- [ ] Advanced analytics dashboard
- [ ] AI-powered crop recommendations

## 📞 Support

If you have any questions or need help:
- Create an [Issue](https://github.com/NitishDwi07/SmartMandis/issues)
- Contact the maintainers
- Check the [Wiki](https://github.com/NitishDwi07/SmartMandis/wiki) for detailed documentation

## 🌟 Acknowledgments

- Thanks to the open-source community for the amazing tools and libraries
- Agricultural experts who provided domain knowledge
- Beta testers and early adopters for valuable feedback

---

⭐ **Star this repository if you found it helpful!** ⭐

Made with ❤️ for the Walmart India’s procurement team and other retail Companies.

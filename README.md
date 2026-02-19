# Linalysis Dashboard 📊

A comprehensive LinkedIn analytics dashboard built with Streamlit for analyzing LinkedIn profile performance and campaign metrics.

## 🎯 Project Overview

**Linalysis** is a powerful LinkedIn analytics tool that helps users track and analyze their LinkedIn performance data. The application provides interactive visualizations for profile analytics, campaign performance tracking, and social selling insights.

### Key Features
- 📈 **LinkedIn Profile Analytics** - Track connections, views, and search appearances
- 🎯 **Campaign Performance** - Analyze messaging and email campaign metrics
- 📊 **Interactive Visualizations** - Plotly-powered charts and graphs
- 🔍 **Social Selling Index (SSI)** - Monitor your LinkedIn engagement score
- 📉 **Trend Analysis** - Period-over-period comparisons and insights
- 🎨 **Professional UI** - Custom-styled dashboard with brand colors

## 🌐 Links

- **Live App**: https://linalysis.us (Genspark Hosted Deploy)
- **GitHub**: https://github.com/gershonconsulting/linalysis
- **Status**: ✅ Active
- **Last Updated**: February 18, 2026

## 🛠️ Technology Stack

- **Framework**: Streamlit (Python web framework)
- **Data Processing**: Pandas, NumPy
- **Visualizations**: Plotly Express & Plotly Graph Objects
- **Authentication**: LinkedIn OAuth 2.0 (demo mode available)

## 📦 Project Structure

```
linalysis/
├── app.py                          # Main Streamlit application
├── linkedin_data_processor.py      # LinkedIn profile data processing
├── campaign_data_processor.py      # Campaign metrics processing
├── visualization.py                # Profile visualization components
├── campaign_visualization.py       # Campaign visualization components
├── utils.py                        # Utility functions
├── linkedin_auth.py               # LinkedIn OAuth integration
├── pyproject.toml                 # Project dependencies
├── .streamlit/                    # Streamlit configuration
└── attached_assets/               # Static assets
```

## 🚀 Getting Started

### Prerequisites
- Python 3.8 or higher
- pip package manager

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/gershonconsulting/linalysis.git
cd linalysis
```

2. **Install dependencies**
```bash
pip install streamlit pandas plotly numpy
```

3. **Run the application**
```bash
streamlit run app.py
```

The dashboard will open in your default browser at `http://localhost:8501`

## 📊 Features Breakdown

### LinkedIn Profile Analytics
- **Connections Growth**: Track your network expansion over time
- **Profile Views**: Monitor who's viewing your profile
- **Search Appearances**: Analyze your LinkedIn search visibility
- **SSI Tracking**: Social Selling Index performance monitoring
- **Heatmap Analysis**: Weekly engagement pattern visualization

### Campaign Analytics
- **Performance Metrics**: Sent, delivered, opens, responses, conversions
- **Conversion Funnels**: Visual campaign funnel analysis
- **Campaign Comparison**: Side-by-side campaign performance
- **Day-of-Week Analysis**: Identify best days for engagement
- **Smart Recommendations**: AI-generated improvement suggestions

### Data Analysis
- **Period Comparisons**: Week-over-week and month-over-month trends
- **Statistical Insights**: Automated calculation of key metrics
- **Interactive Charts**: Hover, zoom, and filter capabilities
- **Export Options**: Download charts and data

## 📈 Data Input

The application accepts CSV files exported from LinkedIn:

### LinkedIn Profile Data
Required columns:
- Date
- Connections
- Profile Views
- Search Appearances
- SSI Score (optional)

### Campaign Data
Required columns:
- Campaign Name
- Date
- Sent
- Delivered
- Opens
- Responses
- Conversions

## 🎨 Customization

The dashboard uses a custom color scheme:
- **Primary Color**: Orange (#FE1B04) - Brand color
- **Secondary Color**: LinkedIn Blue (#0A66C2)
- **Background**: Light Gray (#FAFAFA)

## 🔐 Authentication

Currently running in **demo mode** for easy testing. LinkedIn OAuth integration is available in the codebase but disabled by default.

To enable LinkedIn OAuth:
1. Uncomment the authentication imports in `app.py`
2. Set up LinkedIn App credentials
3. Configure redirect URIs in `.streamlit/secrets.toml`

## 🚀 Deployment

### Current Deployment: Genspark Hosted Deploy
This application is configured for deployment to **linalysis.us** using Genspark's Hosted Deploy feature.

**Deployment files included:**
- `requirements.txt` - Python dependencies
- `Procfile` - Application startup command
- `runtime.txt` - Python version specification
- `.streamlit/config.toml` - Production configuration

**See [GENSPARK_DEPLOY.md](GENSPARK_DEPLOY.md) for complete deployment instructions.**

### Alternative Platforms
- **Streamlit Cloud**: share.streamlit.io
- **Railway**: Direct GitHub integration
- **Render**: Python web service deployment
- **Heroku**: Use included Procfile

## 📝 Current Status

### ✅ Completed Features
- LinkedIn profile data visualization
- Campaign performance analytics
- Interactive Plotly charts
- Period-over-period comparisons
- Statistical calculations
- Demo mode for testing
- Custom styling and branding
- Error handling and validation
- CSV file upload and processing
- Heatmap visualizations
- Funnel chart analysis

### 🔄 Recommended Next Steps
1. **Enable LinkedIn OAuth** - Connect to LinkedIn API for real-time data
2. **Add Data Export** - Enable users to download analyzed data
3. **Implement Alerts** - Set up performance threshold notifications
4. **Add More Metrics** - Integrate post engagement and content analytics
5. **User Accounts** - Add multi-user support with saved preferences
6. **Scheduled Reports** - Automated weekly/monthly report generation

## 🧪 Testing

To test with sample data:
```python
# Demo mode is enabled by default
# Upload any CSV file matching the required format
```

## 📄 License

Copyright © Gershon Consulting

## 👤 Author

**Gershon Consulting**
- GitHub: [@gershonconsulting](https://github.com/gershonconsulting)

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## 📞 Support

For questions or support, please open an issue on GitHub.

---

**Built with ❤️ using Streamlit and Plotly**

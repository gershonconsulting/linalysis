# Linalysis Dashboard

## Overview

Linalysis is a comprehensive LinkedIn analytics dashboard built with Streamlit that helps users analyze their LinkedIn performance data and campaign metrics. The application provides data visualization capabilities for LinkedIn profile analytics, campaign performance tracking, and social selling insights. It processes uploaded CSV data to generate interactive charts, statistics, and recommendations for improving LinkedIn engagement and campaign effectiveness.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: Streamlit web framework for rapid dashboard development
- **Layout**: Wide-layout design with expandable sidebar navigation
- **Page Configuration**: Configured with custom page title, icon, and responsive layout
- **User Interface**: Single-page application with file upload functionality and interactive visualizations

### Data Processing Layer
- **Core Processors**: 
  - `linkedin_data_processor.py` - Handles LinkedIn profile analytics data
  - `campaign_data_processor.py` - Processes LinkedIn campaign data (messaging and email campaigns)
- **Data Validation**: Automatic column validation and data type conversion with error handling
- **Data Transformation**: Calculates derived metrics like engagement rates, period-over-period comparisons, and campaign performance indicators

### Visualization Components
- **Charting Library**: Plotly Express and Plotly Graph Objects for interactive visualizations
- **Chart Types**: Line charts, bar charts, heatmaps, funnel charts, and comparison charts
- **Styling**: Consistent color palette with orange (#FE1B04) as primary brand color and LinkedIn blue (#0A66C2) as secondary
- **Template System**: Centralized chart styling through `apply_chart_template()` function

### Authentication System
- **LinkedIn OAuth**: OAuth 2.0 integration for LinkedIn API access (currently in demo mode)
- **Session Management**: Streamlit session state for managing authentication tokens and user information
- **Demo Mode**: Fallback demo functionality that bypasses authentication for development/testing

### Data Analysis Features
- **Statistical Calculations**: Period-over-period comparisons, trend analysis, and performance metrics
- **Campaign Analytics**: Campaign performance tracking, conversion funnel analysis, and recommendation generation
- **Metrics Tracking**: Connections growth, profile views, search appearances, and Social Selling Index (SSI)

### Utility Functions
- **Error Handling**: Centralized error message display and user guidance
- **Data Formatting**: Metric change formatting and chart analysis generation
- **File Processing**: CSV file validation and parsing with robust error handling

## External Dependencies

### Core Libraries
- **Streamlit**: Web framework for the dashboard interface
- **Pandas**: Data manipulation and analysis
- **NumPy**: Numerical computing and data operations
- **Plotly**: Interactive data visualization (Express and Graph Objects)

### LinkedIn Integration
- **LinkedIn OAuth API**: Authentication and user profile access
- **LinkedIn Marketing API**: Campaign data and analytics (planned integration)

### Data Sources
- **CSV File Uploads**: Primary data input method for LinkedIn exports
- **LinkedIn Data Exports**: Compatible with standard LinkedIn analytics exports
- **Campaign Data**: Supports messaging and email campaign data with metrics like sent, delivered, opens, responses, and conversions

### Authentication Services
- **OAuth 2.0**: LinkedIn authentication flow
- **Session Management**: Streamlit's built-in session state management

### Development Dependencies
- **Python Standard Library**: datetime, timedelta, io, time modules for data processing and utilities
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def process_linkedin_data(file):
    """
    Process the uploaded LinkedIn data CSV file
    
    Args:
        file: Uploaded CSV file object
        
    Returns:
        DataFrame: Processed LinkedIn data or None if processing fails
    """
    try:
        # Read the CSV file
        df = pd.read_csv(file)
        
        # Check if this is a LinkedIn data export
        required_columns = ['Date', 'Connections']
        if not all(col in df.columns for col in required_columns):
            return None
        
        # Convert Date column to datetime
        df['Date'] = pd.to_datetime(df['Date'])
        
        # Sort by date in ascending order
        df = df.sort_values('Date').reset_index(drop=True)
        
        # Handle potential missing or incorrect data
        for col in df.columns:
            if col != 'Date':
                # Convert to numeric, coercing errors to NaN
                df[col] = pd.to_numeric(df[col], errors='coerce')
        
        # Fill missing values with appropriate method for each column
        # For most metrics, forward fill is appropriate
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        df[numeric_cols] = df[numeric_cols].fillna(method='ffill')
        
        return df
    
    except Exception as e:
        print(f"Error processing LinkedIn data: {str(e)}")
        return None

def calculate_statistics(df):
    """
    Calculate statistics from the LinkedIn data
    
    Args:
        df: DataFrame containing processed LinkedIn data
        
    Returns:
        dict: Dictionary containing calculated statistics
    """
    stats = {}
    
    if df.empty:
        return stats
    
    # Get first and last row for calculating changes
    first_row = df.iloc[0]
    last_row = df.iloc[-1]
    
    # Basic statistics
    stats['latest_connections'] = int(last_row['Connections'])
    stats['latest_views'] = int(last_row['Views']) if 'Views' in df.columns else 0
    stats['latest_search'] = int(last_row['Search Appearance']) if 'Search Appearance' in df.columns else 0
    stats['latest_ssi'] = int(last_row['SSI']) if 'SSI' in df.columns else 0
    
    # Calculate changes over the period
    stats['connections_change'] = int(last_row['Connections'] - first_row['Connections'])
    stats['views_change'] = int(last_row['Views'] - first_row['Views']) if 'Views' in df.columns else 0
    stats['search_change'] = int(last_row['Search Appearance'] - first_row['Search Appearance']) if 'Search Appearance' in df.columns else 0
    stats['ssi_change'] = round(float(last_row['SSI'] - first_row['SSI']), 1) if 'SSI' in df.columns else 0
    
    # Calculate averages
    date_range = (last_row['Date'] - first_row['Date']).days + 1
    date_range = max(1, date_range)  # Avoid division by zero
    
    stats['avg_connections_growth'] = stats['connections_change'] / date_range
    stats['avg_views'] = df['Views'].mean() if 'Views' in df.columns else 0
    stats['avg_search'] = df['Search Appearance'].mean() if 'Search Appearance' in df.columns else 0
    stats['avg_ssi'] = df['SSI'].mean() if 'SSI' in df.columns else 0
    stats['avg_ssi_industry'] = df['SSI Industry'].mean() if 'SSI Industry' in df.columns else 0
    stats['avg_ssi_network'] = df['SSI Network'].mean() if 'SSI Network' in df.columns else 0
    
    # Calculate max values
    stats['max_ssi'] = int(df['SSI'].max()) if 'SSI' in df.columns else 0
    
    # Calculate projections
    stats['projected_monthly_growth'] = stats['avg_connections_growth'] * 30
    stats['projected_annual_growth'] = stats['avg_connections_growth'] * 365
    
    # Calculate ratio
    if stats['connections_change'] > 0 and 'Views' in df.columns:
        stats['view_connection_ratio'] = df['Views'].sum() / stats['connections_change']
    else:
        stats['view_connection_ratio'] = 0
    
    return stats

"""
Linalysis Campaign Data Processor
=================================
Process and analyze LinkedIn campaign data for:
- Messaging campaigns
- Email campaigns
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def process_campaign_data(file, campaign_type="messaging"):
    """
    Process the uploaded campaign data CSV file
    
    Args:
        file: Uploaded CSV file object
        campaign_type: Type of campaign (messaging or emailing)
        
    Returns:
        DataFrame: Processed campaign data or None if processing fails
    """
    try:
        # Read the CSV file
        df = pd.read_csv(file)
        
        # Ensure the data has the expected columns
        required_columns = ["Date", "Campaign Name", "Status", "Sent", "Delivered", "Opens", "Responses", "Conversions"]
        
        # Check if required columns exist
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            print(f"Missing required columns: {missing_columns}")
            return None
        
        # Convert date column to datetime
        df['Date'] = pd.to_datetime(df['Date'])
        
        # Sort data by date
        df = df.sort_values('Date')
        
        # Add additional metrics
        df['Open Rate'] = (df['Opens'] / df['Delivered']) * 100
        df['Response Rate'] = (df['Responses'] / df['Delivered']) * 100
        df['Conversion Rate'] = (df['Conversions'] / df['Delivered']) * 100
        
        # Add campaign age in days
        today = datetime.now()
        df['Campaign Age'] = (today - df['Date']).dt.days
        
        # Return the processed dataframe
        return df
        
    except Exception as e:
        print(f"Error processing campaign data: {str(e)}")
        return None

def calculate_campaign_statistics(df, campaign_type="messaging"):
    """
    Calculate statistics from the campaign data
    
    Args:
        df: DataFrame containing processed campaign data
        campaign_type: Type of campaign (messaging or emailing)
        
    Returns:
        dict: Dictionary containing calculated statistics
    """
    if df is None or len(df) == 0:
        return {}
    
    # Calculate overall statistics
    stats = {
        'total_campaigns': len(df['Campaign Name'].unique()),
        'active_campaigns': len(df[df['Status'] == 'Active']['Campaign Name'].unique()),
        'completed_campaigns': len(df[df['Status'] == 'Completed']['Campaign Name'].unique()),
        'total_sent': df['Sent'].sum(),
        'total_delivered': df['Delivered'].sum(),
        'total_opens': df['Opens'].sum(),
        'total_responses': df['Responses'].sum(),
        'total_conversions': df['Conversions'].sum(),
        'avg_open_rate': (df['Opens'].sum() / df['Delivered'].sum() * 100) if df['Delivered'].sum() > 0 else 0,
        'avg_response_rate': (df['Responses'].sum() / df['Delivered'].sum() * 100) if df['Delivered'].sum() > 0 else 0,
        'avg_conversion_rate': (df['Conversions'].sum() / df['Delivered'].sum() * 100) if df['Delivered'].sum() > 0 else 0,
    }
    
    # Calculate daily averages
    unique_dates = df['Date'].nunique()
    if unique_dates > 0:
        stats.update({
            'daily_sent_avg': df['Sent'].sum() / unique_dates,
            'daily_responses_avg': df['Responses'].sum() / unique_dates,
            'daily_conversions_avg': df['Conversions'].sum() / unique_dates,
        })
    
    # Calculate best performing campaign
    if len(df) > 0:
        best_campaign_idx = df['Conversion Rate'].idxmax()
        stats['best_campaign'] = df.loc[best_campaign_idx, 'Campaign Name']
        stats['best_campaign_conversion'] = df.loc[best_campaign_idx, 'Conversion Rate']

    # Calculate week-over-week change
    if 'Date' in df.columns and len(df) > 0:
        today = df['Date'].max()
        week_ago = today - timedelta(days=7)
        two_weeks_ago = today - timedelta(days=14)
        
        current_week = df[df['Date'] > week_ago]
        previous_week = df[(df['Date'] <= week_ago) & (df['Date'] > two_weeks_ago)]
        
        # Calculate conversion change
        current_conversion_rate = current_week['Conversion Rate'].mean() if len(current_week) > 0 else 0
        previous_conversion_rate = previous_week['Conversion Rate'].mean() if len(previous_week) > 0 else 0
        
        stats['conversion_rate_week_change'] = current_conversion_rate - previous_conversion_rate
        stats['conversion_rate_week_pct_change'] = (
            (current_conversion_rate / previous_conversion_rate - 1) * 100 
            if previous_conversion_rate > 0 else 0
        )
        
        # Calculate response rate change
        current_response_rate = current_week['Response Rate'].mean() if len(current_week) > 0 else 0
        previous_response_rate = previous_week['Response Rate'].mean() if len(previous_week) > 0 else 0
        
        stats['response_rate_week_change'] = current_response_rate - previous_response_rate
        stats['response_rate_week_pct_change'] = (
            (current_response_rate / previous_response_rate - 1) * 100 
            if previous_response_rate > 0 else 0
        )
    
    return stats

def generate_campaign_recommendations(df, stats):
    """
    Generate recommendations based on campaign performance
    
    Args:
        df: DataFrame containing processed campaign data
        stats: Dictionary of calculated statistics
        
    Returns:
        list: List of recommendation strings
    """
    recommendations = []
    
    if df is None or len(df) == 0:
        return ["No campaign data available for analysis."]
    
    # Analyze open rates
    if stats.get('avg_open_rate', 0) < 20:
        recommendations.append("Your average open rate is low. Consider improving your subject lines with more engaging content.")
    
    # Analyze response rates
    if stats.get('avg_response_rate', 0) < 5:
        recommendations.append("Your response rate could be improved. Test different message formats and more personalized content.")
    
    # Analyze conversion rates
    if stats.get('avg_conversion_rate', 0) < 2:
        recommendations.append("Your conversion rate is below target. Review your call-to-action and offer incentives to improve conversions.")
    
    # Analyze campaign timing
    if 'Date' in df.columns:
        # Get day of week performance
        df['DayOfWeek'] = df['Date'].dt.day_name()
        day_performance = df.groupby('DayOfWeek')['Conversion Rate'].mean().sort_values(ascending=False)
        
        if not day_performance.empty:
            best_day = day_performance.index[0]
            recommendations.append(f"{best_day} shows the highest conversion rate. Consider scheduling more campaigns on this day.")
    
    # Analyze campaign frequency
    if stats.get('total_campaigns', 0) < 3:
        recommendations.append("You're running relatively few campaigns. Consider increasing frequency to improve results.")
    
    # Add a recommendation based on best performing campaign
    if 'best_campaign' in stats:
        recommendations.append(f"'{stats['best_campaign']}' is your best performing campaign with a {stats['best_campaign_conversion']:.2f}% conversion rate. Consider using similar messaging in future campaigns.")
    
    return recommendations

def get_campaign_sample_data():
    """
    Generate sample campaign data for demonstration purposes
    
    Returns:
        DataFrame: Sample campaign data
    """
    # Generate dates for the past 30 days
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)
    dates = pd.date_range(start=start_date, end=end_date, freq='D')
    
    # Campaign names
    campaign_names = [
        "Q2 Product Launch", 
        "New Connection Outreach", 
        "Content Promotion", 
        "Event Invitation", 
        "Lead Nurturing"
    ]
    
    # Create a list of data
    data = []
    for campaign in campaign_names:
        for date in dates:
            # Random metrics
            sent = np.random.randint(50, 200)
            delivered = int(sent * np.random.uniform(0.90, 0.98))  # 90-98% delivery rate
            opens = int(delivered * np.random.uniform(0.15, 0.40))  # 15-40% open rate
            responses = int(opens * np.random.uniform(0.10, 0.25))  # 10-25% response rate of opens
            conversions = int(responses * np.random.uniform(0.05, 0.20))  # 5-20% conversion rate of responses
            
            # Status based on date
            status = "Completed" if date < (end_date - timedelta(days=15)) else "Active"
            
            # Add row to data
            data.append({
                "Date": date,
                "Campaign Name": campaign,
                "Status": status,
                "Sent": sent,
                "Delivered": delivered,
                "Opens": opens,
                "Responses": responses,
                "Conversions": conversions
            })
    
    # Create DataFrame
    df = pd.DataFrame(data)
    
    # Add calculated metrics
    df['Open Rate'] = (df['Opens'] / df['Delivered']) * 100
    df['Response Rate'] = (df['Responses'] / df['Delivered']) * 100
    df['Conversion Rate'] = (df['Conversions'] / df['Delivered']) * 100
    
    return df
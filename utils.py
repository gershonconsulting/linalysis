import streamlit as st

def display_error_message(message):
    """
    Display an error message to the user
    
    Args:
        message: Error message to display
    """
    st.error(f"Error: {message}")
    st.markdown("""
    Please ensure that:
    1. The file is in CSV format
    2. The file contains LinkedIn data with required columns
    3. The file is not corrupted
    """)

def format_metric_change(change, format_type="absolute"):
    """
    Format the metric change for display in st.metric
    
    Args:
        change: The numeric change value
        format_type: The type of formatting to apply (absolute or percentage)
        
    Returns:
        str: Formatted change value
    """
    if format_type == "percentage":
        return f"{change}%"
    else:
        return f"{change:+d}"  # Use plus sign for positive values

def generate_chart_analysis(metric_name, current_value, change, percent_change=None, trend_days=7, additional_context=None):
    """
    Generate AI-like analysis for chart data with color-coded insights
    
    Args:
        metric_name: Name of the metric being analyzed
        current_value: Current value of the metric
        change: Absolute change in the metric
        percent_change: Percentage change in the metric (optional)
        trend_days: Number of days the trend represents (default: 7)
        additional_context: Any additional context for analysis (optional)
        
    Returns:
        tuple: (analysis_text, color_code, emoji)
            analysis_text: Text analysis of the data
            color_code: Color code for the analysis (green, orange, red)
            emoji: Emoji representing the trend
    """
    # Determine performance level
    if percent_change is not None:
        if percent_change >= 10:
            performance = "excellent"
            color = "#2CA02C"  # Green
            emoji = "🚀"
        elif percent_change >= 5:
            performance = "good"
            color = "#2CA02C"  # Green
            emoji = "📈"
        elif percent_change >= 0:
            performance = "stable"
            color = "#FF7F0E"  # Orange
            emoji = "➡️"
        elif percent_change >= -5:
            performance = "slight decline"
            color = "#FF7F0E"  # Orange
            emoji = "⚠️"
        else:
            performance = "significant decline"
            color = "#D62728"  # Red
            emoji = "📉"
    else:
        # Fallback when percent_change is not available
        if change > 0:
            performance = "improving"
            color = "#2CA02C"  # Green
            emoji = "📈"
        elif change == 0:
            performance = "stable"
            color = "#FF7F0E"  # Orange
            emoji = "➡️"
        else:
            performance = "declining"
            color = "#D62728"  # Red
            emoji = "📉"
    
    # Metric-specific analysis templates
    templates = {
        "Connections": {
            "excellent": f"Your network is growing exceptionally well with {change:+} new connections ({percent_change:.1f}%) in the last {trend_days} days. This rapid growth indicates high engagement and effective networking strategy.",
            "good": f"Your network is growing steadily with {change:+} new connections ({percent_change:.1f}%) in the last {trend_days} days. Keep engaging with your audience to maintain this positive trend.",
            "stable": f"Your network growth is stable with {change:+} new connections ({percent_change:.1f}%) in the last {trend_days} days. Consider increasing your content sharing and engagement to accelerate growth.",
            "slight decline": f"Your network has experienced a slight slowdown with {change:+} connections ({percent_change:.1f}%) in the last {trend_days} days. Try reconnecting with your existing network to revitalize growth.",
            "significant decline": f"Your network growth has significantly slowed with {change} connections ({percent_change:.1f}%) in the last {trend_days} days. Consider reviewing your networking strategy and increasing your engagement."
        },
        "Views": {
            "excellent": f"Your profile views have increased substantially by {change:+} ({percent_change:.1f}%) in the last {trend_days} days. Your content and activity are generating exceptional visibility.",
            "good": f"Your profile views are trending positively with {change:+} more views ({percent_change:.1f}%) in the last {trend_days} days. Your LinkedIn presence is gaining good traction.",
            "stable": f"Your profile views are holding steady ({change:+} views, {percent_change:.1f}%) over the last {trend_days} days. Try posting more frequently to increase visibility.",
            "slight decline": f"Your profile views have slightly decreased by {abs(change)} ({percent_change:.1f}%) in the last {trend_days} days. Consider updating your profile or increasing post frequency.",
            "significant decline": f"Your profile views have dropped significantly by {abs(change)} ({percent_change:.1f}%) in the last {trend_days} days. It's recommended to revise your content strategy and increase engagement."
        },
        "Search Appearances": {
            "excellent": f"Your search appearances have increased remarkably by {change:+} ({percent_change:.1f}%) in the last {trend_days} days. Your profile optimization is working exceptionally well.",
            "good": f"Your search appearances are growing well with {change:+} more appearances ({percent_change:.1f}%) in the last {trend_days} days. Your profile is increasingly discoverable.",
            "stable": f"Your search appearances are stable ({change:+}, {percent_change:.1f}%) over the last {trend_days} days. Consider updating your profile keywords to improve discoverability.",
            "slight decline": f"Your search appearances have decreased slightly by {abs(change)} ({percent_change:.1f}%) in the last {trend_days} days. Review your profile keywords and descriptions.",
            "significant decline": f"Your search appearances have decreased significantly by {abs(change)} ({percent_change:.1f}%) in the last {trend_days} days. A comprehensive profile keyword optimization is recommended."
        },
        "SSI": {
            "excellent": f"Your Social Selling Index has improved significantly by {change:+} points ({percent_change:.1f}%) in the last {trend_days} days. You're excelling in building your professional brand and network.",
            "good": f"Your Social Selling Index is growing well with {change:+} points ({percent_change:.1f}%) in the last {trend_days} days. Your social selling strategy is effective.",
            "stable": f"Your Social Selling Index is stable ({change:+} points, {percent_change:.1f}%) over the last {trend_days} days. Focus on the four pillars of SSI to see improvements.",
            "slight decline": f"Your Social Selling Index has slightly decreased by {abs(change)} points ({percent_change:.1f}%) in the last {trend_days} days. Consider strengthening your professional brand and engagement.",
            "significant decline": f"Your Social Selling Index has dropped significantly by {abs(change)} points ({percent_change:.1f}%) in the last {trend_days} days. A review of all four SSI pillars is recommended."
        },
        "Invitations": {
            "excellent": f"Your pending invitations have changed by {change:+} ({percent_change:.1f}%) in the last {trend_days} days. You're effectively managing your network growth.", 
            "good": f"Your pending invitations have changed by {change:+} ({percent_change:.1f}%) in the last {trend_days} days. Continue monitoring and responding to keep your network healthy.",
            "stable": f"Your pending invitations are stable ({change:+}, {percent_change:.1f}%) over the last {trend_days} days. Remember to regularly review and respond to connection requests.",
            "slight decline": f"Your pending invitations have changed by {change} ({percent_change:.1f}%) in the last {trend_days} days. Keep an eye on your connection management.",
            "significant decline": f"Your pending invitations have changed significantly by {change} ({percent_change:.1f}%) in the last {trend_days} days. Pay attention to your invitation management."
        }
    }
    
    # Default template for any other metrics
    default_template = {
        "excellent": f"Your {metric_name} metric shows exceptional growth with {change:+} ({percent_change:.1f}%) in the last {trend_days} days. This indicates excellent performance.",
        "good": f"Your {metric_name} metric is trending positively with {change:+} ({percent_change:.1f}%) in the last {trend_days} days. This is a good sign of growth.",
        "stable": f"Your {metric_name} metric is stable ({change:+}, {percent_change:.1f}%) over the last {trend_days} days. Consider strategies to improve this metric.",
        "slight decline": f"Your {metric_name} metric shows a slight decrease of {abs(change)} ({percent_change:.1f}%) in the last {trend_days} days. Some attention may be needed.",
        "significant decline": f"Your {metric_name} metric has decreased significantly by {abs(change)} ({percent_change:.1f}%) in the last {trend_days} days. This area needs attention."
    }
    
    # Select the appropriate template
    template = templates.get(metric_name, default_template)
    analysis_text = template.get(performance, default_template[performance])
    
    # Add additional context if provided
    if additional_context:
        analysis_text += f" {additional_context}"
    
    return analysis_text, color, emoji

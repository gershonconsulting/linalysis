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

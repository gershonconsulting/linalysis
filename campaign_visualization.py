"""
Linalysis Campaign Visualization Module
======================================
Visualization functions for LinkedIn campaign data
"""

import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd
import numpy as np

def apply_campaign_chart_template(fig):
    """Apply consistent styling to all campaign charts"""
    fig.update_layout(
        template="plotly_white",
        font=dict(family="Arial, sans-serif", size=12),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        margin=dict(l=20, r=20, t=40, b=20),
        hovermode="closest",
        plot_bgcolor="white",
        paper_bgcolor="white",
        xaxis=dict(showgrid=False, zeroline=False),
        yaxis=dict(showgrid=True, gridcolor="rgba(0,0,0,0.1)", zeroline=False)
    )
    
    # Apply consistent coloring
    if 'data' in fig:
        for i, trace in enumerate(fig.data):
            if i == 0 and 'marker' in trace:
                trace.marker.color = "#FE1B04"  # Main Linalysis color
            elif 'marker' in trace:
                trace.marker.color = ["#FE1B04", "#0A66C2", "#2CA02C", "#FF7F0E", "#9467BD"][i % 5]
    
    return fig

def create_campaign_performance_chart(df):
    """
    Create a line chart for campaign performance over time
    
    Args:
        df: DataFrame containing campaign data
        
    Returns:
        Figure: Plotly figure object
    """
    # Group by date and calculate metrics
    daily_metrics = df.groupby('Date').agg({
        'Sent': 'sum',
        'Delivered': 'sum',
        'Opens': 'sum',
        'Responses': 'sum',
        'Conversions': 'sum'
    }).reset_index()
    
    # Create figure with secondary y-axis
    fig = make_subplots(specs=[[{"secondary_y": True}]])
    
    # Add counts on primary axis
    fig.add_trace(
        go.Scatter(
            x=daily_metrics['Date'], 
            y=daily_metrics['Sent'],
            name="Sent",
            mode='lines+markers',
            line=dict(color="#FE1B04", width=2),
            marker=dict(size=6)
        ),
        secondary_y=False,
    )
    
    fig.add_trace(
        go.Scatter(
            x=daily_metrics['Date'], 
            y=daily_metrics['Delivered'],
            name="Delivered",
            mode='lines+markers',
            line=dict(color="#0A66C2", width=2),
            marker=dict(size=6)
        ),
        secondary_y=False,
    )
    
    fig.add_trace(
        go.Scatter(
            x=daily_metrics['Date'], 
            y=daily_metrics['Opens'],
            name="Opens",
            mode='lines+markers',
            line=dict(color="#2CA02C", width=2),
            marker=dict(size=6)
        ),
        secondary_y=False,
    )
    
    # Add responses on secondary axis
    fig.add_trace(
        go.Scatter(
            x=daily_metrics['Date'], 
            y=daily_metrics['Responses'],
            name="Responses",
            mode='lines+markers',
            line=dict(color="#FF7F0E", width=2, dash='dot'),
            marker=dict(size=6)
        ),
        secondary_y=True,
    )
    
    fig.add_trace(
        go.Scatter(
            x=daily_metrics['Date'], 
            y=daily_metrics['Conversions'],
            name="Conversions",
            mode='lines+markers',
            line=dict(color="#9467BD", width=2, dash='dot'),
            marker=dict(size=6)
        ),
        secondary_y=True,
    )
    
    # Set title and labels
    fig.update_layout(
        title="Campaign Performance Over Time",
        xaxis_title="Date",
    )
    
    # Set y-axes titles
    fig.update_yaxes(title_text="Volume", secondary_y=False)
    fig.update_yaxes(title_text="Responses & Conversions", secondary_y=True)
    
    # Apply template
    return apply_campaign_chart_template(fig)

def create_campaign_rates_chart(df):
    """
    Create a line chart for campaign rates over time
    
    Args:
        df: DataFrame containing campaign data
        
    Returns:
        Figure: Plotly figure object
    """
    # Group by date and calculate metrics
    daily_metrics = df.groupby('Date').agg({
        'Open Rate': 'mean',
        'Response Rate': 'mean',
        'Conversion Rate': 'mean'
    }).reset_index()
    
    # Create figure
    fig = go.Figure()
    
    # Add rates
    fig.add_trace(
        go.Scatter(
            x=daily_metrics['Date'], 
            y=daily_metrics['Open Rate'],
            name="Open Rate (%)",
            mode='lines+markers',
            line=dict(color="#FE1B04", width=2),
            marker=dict(size=6)
        )
    )
    
    fig.add_trace(
        go.Scatter(
            x=daily_metrics['Date'], 
            y=daily_metrics['Response Rate'],
            name="Response Rate (%)",
            mode='lines+markers',
            line=dict(color="#0A66C2", width=2),
            marker=dict(size=6)
        )
    )
    
    fig.add_trace(
        go.Scatter(
            x=daily_metrics['Date'], 
            y=daily_metrics['Conversion Rate'],
            name="Conversion Rate (%)",
            mode='lines+markers',
            line=dict(color="#2CA02C", width=2),
            marker=dict(size=6)
        )
    )
    
    # Set title and labels
    fig.update_layout(
        title="Campaign Performance Rates Over Time",
        xaxis_title="Date",
        yaxis_title="Rate (%)"
    )
    
    # Apply template
    return apply_campaign_chart_template(fig)

def create_campaign_comparison_chart(df):
    """
    Create a bar chart comparing performance of different campaigns
    
    Args:
        df: DataFrame containing campaign data
        
    Returns:
        Figure: Plotly figure object
    """
    # Group by campaign name and calculate metrics
    campaign_metrics = df.groupby('Campaign Name').agg({
        'Sent': 'sum',
        'Delivered': 'sum',
        'Opens': 'sum',
        'Responses': 'sum',
        'Conversions': 'sum',
        'Open Rate': 'mean',
        'Response Rate': 'mean',
        'Conversion Rate': 'mean'
    }).reset_index()
    
    # Sort by conversion rate
    campaign_metrics = campaign_metrics.sort_values('Conversion Rate', ascending=False)
    
    # Create figure with secondary y-axis
    fig = make_subplots(specs=[[{"secondary_y": True}]])
    
    # Add bars for sent messages
    fig.add_trace(
        go.Bar(
            x=campaign_metrics['Campaign Name'],
            y=campaign_metrics['Sent'],
            name="Sent",
            marker_color="#FE1B04",
            opacity=0.8
        ),
        secondary_y=False,
    )
    
    # Add bars for responses
    fig.add_trace(
        go.Bar(
            x=campaign_metrics['Campaign Name'],
            y=campaign_metrics['Responses'],
            name="Responses",
            marker_color="#0A66C2",
            opacity=0.8
        ),
        secondary_y=False,
    )
    
    # Add line for conversion rate
    fig.add_trace(
        go.Scatter(
            x=campaign_metrics['Campaign Name'],
            y=campaign_metrics['Conversion Rate'],
            name="Conversion Rate (%)",
            mode='lines+markers',
            line=dict(color="#2CA02C", width=3),
            marker=dict(size=10)
        ),
        secondary_y=True,
    )
    
    # Set title and labels
    fig.update_layout(
        title="Campaign Comparison",
        xaxis_title="Campaign Name",
        barmode='group'
    )
    
    # Set y-axes titles
    fig.update_yaxes(title_text="Volume", secondary_y=False)
    fig.update_yaxes(title_text="Conversion Rate (%)", secondary_y=True)
    
    # Apply template
    return apply_campaign_chart_template(fig)

def create_campaign_funnel_chart(df):
    """
    Create a funnel chart for overall campaign performance
    
    Args:
        df: DataFrame containing campaign data
        
    Returns:
        Figure: Plotly figure object
    """
    # Calculate funnel metrics
    funnel_metrics = [
        df['Sent'].sum(),
        df['Delivered'].sum(),
        df['Opens'].sum(),
        df['Responses'].sum(),
        df['Conversions'].sum()
    ]
    
    funnel_labels = ["Sent", "Delivered", "Opens", "Responses", "Conversions"]
    
    # Create funnel chart
    fig = go.Figure(go.Funnel(
        y=funnel_labels,
        x=funnel_metrics,
        textinfo="value+percent initial",
        marker=dict(
            color=["#FE1B04", "#FF7F0E", "#2CA02C", "#0A66C2", "#9467BD"]
        ),
        connector=dict(line=dict(color="royalblue", dash="dot", width=1))
    ))
    
    # Update layout
    fig.update_layout(
        title="Campaign Funnel Analysis",
        margin=dict(l=80, r=20, t=60, b=20)
    )
    
    # Apply template
    return apply_campaign_chart_template(fig)

def create_day_of_week_performance_chart(df):
    """
    Create a bar chart showing performance by day of week
    
    Args:
        df: DataFrame containing campaign data
        
    Returns:
        Figure: Plotly figure object
    """
    # Add day of week column
    df_copy = df.copy()
    df_copy['DayOfWeek'] = df_copy['Date'].dt.day_name()
    
    # Order days of week
    day_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    
    # Group by day of week and calculate metrics
    day_metrics = df_copy.groupby('DayOfWeek').agg({
        'Open Rate': 'mean',
        'Response Rate': 'mean',
        'Conversion Rate': 'mean'
    }).reset_index()
    
    # Reorder based on day_order
    day_metrics['DayOfWeek'] = pd.Categorical(day_metrics['DayOfWeek'], categories=day_order, ordered=True)
    day_metrics = day_metrics.sort_values('DayOfWeek')
    
    # Create figure
    fig = go.Figure()
    
    # Add bars for each rate
    fig.add_trace(go.Bar(
        x=day_metrics['DayOfWeek'],
        y=day_metrics['Open Rate'],
        name='Open Rate (%)',
        marker_color='#FE1B04'
    ))
    
    fig.add_trace(go.Bar(
        x=day_metrics['DayOfWeek'],
        y=day_metrics['Response Rate'],
        name='Response Rate (%)',
        marker_color='#0A66C2'
    ))
    
    fig.add_trace(go.Bar(
        x=day_metrics['DayOfWeek'],
        y=day_metrics['Conversion Rate'],
        name='Conversion Rate (%)',
        marker_color='#2CA02C'
    ))
    
    # Update layout
    fig.update_layout(
        title='Performance by Day of Week',
        xaxis_title='Day of Week',
        yaxis_title='Rate (%)',
        barmode='group'
    )
    
    # Apply template
    return apply_campaign_chart_template(fig)

def create_campaign_heatmap(df):
    """
    Create a correlation heatmap for campaign metrics
    
    Args:
        df: DataFrame containing campaign data
        
    Returns:
        Figure: Plotly figure object
    """
    # Select numeric columns for correlation
    numeric_cols = ['Sent', 'Delivered', 'Opens', 'Responses', 'Conversions', 
                   'Open Rate', 'Response Rate', 'Conversion Rate']
    
    # Calculate correlation matrix
    corr_matrix = df[numeric_cols].corr()
    
    # Create heatmap
    fig = px.imshow(
        corr_matrix,
        labels=dict(color="Correlation"),
        x=corr_matrix.columns,
        y=corr_matrix.columns,
        color_continuous_scale='RdBu_r',
        zmin=-1, zmax=1
    )
    
    # Update layout
    fig.update_layout(
        title="Correlation Between Campaign Metrics",
        xaxis_title="",
        yaxis_title="",
        xaxis=dict(tickangle=45)
    )
    
    # Add annotations
    annotations = []
    for i, row in enumerate(corr_matrix.values):
        for j, value in enumerate(row):
            annotations.append(
                dict(
                    x=j, y=i,
                    text=f"{value:.2f}",
                    font=dict(color="white" if abs(value) > 0.5 else "black"),
                    showarrow=False
                )
            )
    
    fig.update_layout(annotations=annotations)
    
    # Apply template
    fig.update_layout(
        font=dict(family="Arial, sans-serif", size=12),
        margin=dict(l=20, r=20, t=40, b=20),
        plot_bgcolor="white",
        paper_bgcolor="white"
    )
    
    return fig
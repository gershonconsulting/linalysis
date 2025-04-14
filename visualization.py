import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd
import numpy as np

# Define a consistent color palette with orange as primary color
COLOR_PRIMARY = "#FE1B04"  # Orange - primary brand color
COLOR_SECONDARY = "#0A66C2"  # LinkedIn blue
COLOR_TERTIARY = "#2CA02C"  # Green
COLOR_ACCENT = "#9467BD"  # Purple
COLOR_NEUTRAL = "#7F7F7F"  # Gray

# Create a consistent color palette
COLOR_PALETTE = [COLOR_PRIMARY, COLOR_SECONDARY, COLOR_TERTIARY, COLOR_ACCENT, "#D62728", "#8C564B", "#E377C2"]

# Create template for consistent chart styling
def apply_chart_template(fig):
    """Apply consistent styling to all charts"""
    fig.update_layout(
        font_family="Arial, sans-serif",
        title_font_size=20,
        title_font_color="#333333",
        legend_title_font_color="#333333",
        legend_title_font_size=14,
        plot_bgcolor="white",
        paper_bgcolor="white",
        hovermode="x unified",
        hoverlabel=dict(
            bgcolor="white",
            font_size=14,
            font_family="Arial, sans-serif"
        ),
        xaxis=dict(
            showgrid=False,
            showline=True,
            linecolor="lightgray",
            title_font=dict(size=14, color="#333333"),
            tickfont=dict(size=12, color="#666666"),
        ),
        yaxis=dict(
            showgrid=True,
            gridcolor="rgba(0,0,0,0.05)",
            showline=True,
            linecolor="lightgray",
            title_font=dict(size=14, color="#333333"),
            tickfont=dict(size=12, color="#666666"),
        ),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1,
            font=dict(size=12, color="#666666")
        ),
        margin=dict(l=10, r=10, t=30, b=10),
    )
    
    # Add subtle border around the plot
    fig.update_layout(
        shapes=[
            dict(
                type="rect",
                xref="paper",
                yref="paper",
                x0=0,
                y0=0,
                x1=1,
                y1=1,
                line=dict(color="rgba(0,0,0,0.05)", width=1),
            )
        ]
    )
    
    return fig

def create_connections_chart(df):
    """
    Create a line chart for connections growth over time
    
    Args:
        df: DataFrame containing LinkedIn data
        
    Returns:
        Figure: Plotly figure object
    """
    fig = px.line(
        df, 
        x="Date", 
        y="Connections",
        title="Linalysis Connections Growth Over Time",
        labels={"Connections": "Total Connections", "Date": ""},
        markers=True,
        color_discrete_sequence=[COLOR_PRIMARY]
    )
    
    # Add trendline
    fig.add_trace(
        go.Scatter(
            x=df["Date"],
            y=df["Connections"].rolling(window=7, min_periods=1).mean(),
            mode="lines",
            name="7-Day Moving Average",
            line=dict(color=COLOR_SECONDARY, width=2, dash="dash")
        )
    )
    
    # Add range selector for date filtering
    fig.update_xaxes(
        rangeslider_visible=False,
        rangeselector=dict(
            buttons=list([
                dict(count=7, label="1w", step="day", stepmode="backward"),
                dict(count=1, label="1m", step="month", stepmode="backward"),
                dict(count=3, label="3m", step="month", stepmode="backward"),
                dict(step="all")
            ]),
            font=dict(color="#666666"),
            bgcolor="rgba(255,255,255,0.8)",
            bordercolor="rgba(0,0,0,0.1)",
            borderwidth=1
        )
    )
    
    # Apply consistent template
    fig = apply_chart_template(fig)
    
    return fig

def create_views_chart(df):
    """
    Create a line chart for profile views over time
    
    Args:
        df: DataFrame containing LinkedIn data
        
    Returns:
        Figure: Plotly figure object
    """
    if "Views" not in df.columns:
        return go.Figure()
    
    fig = px.line(
        df, 
        x="Date", 
        y="Views",
        title="Linalysis Profile Views Over Time",
        labels={"Views": "Profile Views", "Date": ""},
        markers=True,
        color_discrete_sequence=[COLOR_PRIMARY]
    )
    
    # Add trendline
    fig.add_trace(
        go.Scatter(
            x=df["Date"],
            y=df["Views"].rolling(window=7, min_periods=1).mean(),
            mode="lines",
            name="7-Day Moving Average",
            line=dict(color=COLOR_SECONDARY, width=2, dash="dash")
        )
    )
    
    # Add range selector for date filtering
    fig.update_xaxes(
        rangeslider_visible=False,
        rangeselector=dict(
            buttons=list([
                dict(count=7, label="1w", step="day", stepmode="backward"),
                dict(count=1, label="1m", step="month", stepmode="backward"),
                dict(count=3, label="3m", step="month", stepmode="backward"),
                dict(step="all")
            ]),
            font=dict(color="#666666"),
            bgcolor="rgba(255,255,255,0.8)",
            bordercolor="rgba(0,0,0,0.1)",
            borderwidth=1
        )
    )
    
    # Apply consistent template
    fig = apply_chart_template(fig)
    
    return fig

def create_search_appearances_chart(df):
    """
    Create a line chart for search appearances over time
    
    Args:
        df: DataFrame containing LinkedIn data
        
    Returns:
        Figure: Plotly figure object
    """
    search_col = 'Search Appearance' if 'Search Appearance' in df.columns else 'Search Appearances'
    
    if search_col not in df.columns:
        return go.Figure()
    
    fig = px.line(
        df, 
        x="Date", 
        y=search_col,
        title="Linalysis Search Appearances Over Time",
        labels={search_col: "Search Appearances", "Date": ""},
        markers=True,
        color_discrete_sequence=[COLOR_PRIMARY]
    )
    
    # Add trendline
    fig.add_trace(
        go.Scatter(
            x=df["Date"],
            y=df[search_col].rolling(window=7, min_periods=1).mean(),
            mode="lines",
            name="7-Day Moving Average",
            line=dict(color=COLOR_SECONDARY, width=2, dash="dash")
        )
    )
    
    # Add range selector for date filtering
    fig.update_xaxes(
        rangeslider_visible=False,
        rangeselector=dict(
            buttons=list([
                dict(count=7, label="1w", step="day", stepmode="backward"),
                dict(count=1, label="1m", step="month", stepmode="backward"),
                dict(count=3, label="3m", step="month", stepmode="backward"),
                dict(step="all")
            ]),
            font=dict(color="#666666"),
            bgcolor="rgba(255,255,255,0.8)",
            bordercolor="rgba(0,0,0,0.1)",
            borderwidth=1
        )
    )
    
    # Apply consistent template
    fig = apply_chart_template(fig)
    
    return fig

def create_ssi_chart(df):
    """
    Create a line chart for SSI score over time with components
    
    Args:
        df: DataFrame containing LinkedIn data
        
    Returns:
        Figure: Plotly figure object
    """
    if "SSI" not in df.columns:
        return go.Figure()
    
    fig = go.Figure()
    
    # Add main SSI line
    fig.add_trace(
        go.Scatter(
            x=df["Date"],
            y=df["SSI"],
            mode="lines+markers",
            name="SSI Score",
            line=dict(color=COLOR_PRIMARY, width=3)
        )
    )
    
    # Add SSI Industry component if available
    if "SSI Industry" in df.columns:
        fig.add_trace(
            go.Scatter(
                x=df["Date"],
                y=df["SSI Industry"],
                mode="lines",
                name="Industry Ranking",
                line=dict(color=COLOR_SECONDARY, width=2, dash="dot")
            )
        )
    
    # Add SSI Network component if available
    if "SSI Network" in df.columns:
        fig.add_trace(
            go.Scatter(
                x=df["Date"],
                y=df["SSI Network"],
                mode="lines",
                name="Network Ranking",
                line=dict(color=COLOR_TERTIARY, width=2, dash="dot")
            )
        )
    
    # Add range selector for date filtering
    fig.update_xaxes(
        rangeslider_visible=False,
        rangeselector=dict(
            buttons=list([
                dict(count=7, label="1w", step="day", stepmode="backward"),
                dict(count=1, label="1m", step="month", stepmode="backward"),
                dict(count=3, label="3m", step="month", stepmode="backward"),
                dict(step="all")
            ]),
            font=dict(color="#666666"),
            bgcolor="rgba(255,255,255,0.8)",
            bordercolor="rgba(0,0,0,0.1)",
            borderwidth=1
        )
    )
    
    # Special layout for SSI chart
    fig.update_layout(
        title="Linalysis Social Selling Index (SSI) Over Time",
        yaxis=dict(
            title="Score",
            range=[0, 100]
        )
    )
    
    # Apply consistent template
    fig = apply_chart_template(fig)
    
    return fig

def create_metrics_comparison_chart(df):
    """
    Create a chart comparing profile views and search appearances
    
    Args:
        df: DataFrame containing LinkedIn data
        
    Returns:
        Figure: Plotly figure object
    """
    search_col = 'Search Appearance' if 'Search Appearance' in df.columns else 'Search Appearances'
    
    if "Views" not in df.columns or search_col not in df.columns:
        return go.Figure()
    
    fig = go.Figure()
    
    # Add profile views line
    fig.add_trace(
        go.Scatter(
            x=df["Date"],
            y=df["Views"],
            mode="lines+markers",
            name="Profile Views",
            line=dict(color=COLOR_PRIMARY, width=2)
        )
    )
    
    # Add search appearances line
    fig.add_trace(
        go.Scatter(
            x=df["Date"],
            y=df[search_col],
            mode="lines+markers",
            name="Search Appearances",
            line=dict(color=COLOR_SECONDARY, width=2)
        )
    )
    
    # Add range selector for date filtering
    fig.update_xaxes(
        rangeslider_visible=False,
        rangeselector=dict(
            buttons=list([
                dict(count=7, label="1w", step="day", stepmode="backward"),
                dict(count=1, label="1m", step="month", stepmode="backward"),
                dict(count=3, label="3m", step="month", stepmode="backward"),
                dict(step="all")
            ]),
            font=dict(color="#666666"),
            bgcolor="rgba(255,255,255,0.8)",
            bordercolor="rgba(0,0,0,0.1)",
            borderwidth=1
        )
    )
    
    # Special layout for comparison chart
    fig.update_layout(
        title="Linalysis Profile Views vs Search Appearances",
        yaxis=dict(title="Count")
    )
    
    # Apply consistent template
    fig = apply_chart_template(fig)
    
    return fig

def create_heatmap(df):
    """
    Create a correlation heatmap for LinkedIn metrics
    
    Args:
        df: DataFrame containing LinkedIn data
        
    Returns:
        Figure: Plotly figure object
    """
    # Select only numeric columns for correlation
    numeric_cols = ['Connections', 'Views', 'SSI']
    search_col = 'Search Appearance' if 'Search Appearance' in df.columns else 'Search Appearances'
    
    if search_col in df.columns:
        numeric_cols.append(search_col)
    
    if 'Invitations' in df.columns:
        numeric_cols.append('Invitations')
    
    # Make sure all columns are in the dataframe
    numeric_cols = [col for col in numeric_cols if col in df.columns]
    
    if len(numeric_cols) < 2:
        return go.Figure()
    
    # Calculate correlation matrix
    corr_matrix = df[numeric_cols].corr().round(2)
    
    # Create heatmap with orange-based color scheme
    fig = px.imshow(
        corr_matrix,
        text_auto=True,
        color_continuous_scale=[COLOR_SECONDARY, 'white', COLOR_PRIMARY],
        zmin=-1, 
        zmax=1,
        title="Correlation Between Linalysis Metrics"
    )
    
    # Improve layout
    fig.update_layout(
        title_font_size=18,
        font_family="Arial, sans-serif",
        font_color="#333333",
        width=500,
        height=500,
        plot_bgcolor="white",
        paper_bgcolor="white",
        margin=dict(l=10, r=10, t=30, b=10),
    )
    
    # Add custom annotation explaining correlation
    fig.add_annotation(
        text="Stronger red indicates positive correlation<br>Stronger blue indicates negative correlation",
        xref="paper", yref="paper",
        x=0.5, y=-0.15,
        showarrow=False,
        font=dict(size=10, color="#666666"),
        align="center"
    )
    
    return fig

def create_company_metrics_chart(df, metric):
    """
    Create a line chart for company metrics over time
    
    Args:
        df: DataFrame containing LinkedIn data
        metric: The company metric to display
        
    Returns:
        Figure: Plotly figure object
    """
    if metric not in df.columns or df[metric].notna().sum() == 0:
        return go.Figure()
    
    # Filter to only rows with the metric data
    chart_df = df[df[metric].notna()]
    
    fig = px.line(
        chart_df, 
        x="Date", 
        y=metric,
        title=f"Linalysis {metric} Over Time",
        labels={metric: metric, "Date": ""},
        markers=True,
        color_discrete_sequence=["rgba(255, 128, 0, 0.9)"]  # Orange main color
    )
    
    # Add trendline if enough data points
    if len(chart_df) >= 3:
        fig.add_trace(
            go.Scatter(
                x=chart_df["Date"],
                y=chart_df[metric].rolling(window=min(7, len(chart_df)), min_periods=1).mean(),
                mode="lines",
                name="Moving Average",
                line=dict(color="rgba(255, 84, 0, 0.5)", width=2, dash="dash")  # Darker orange for trendline
            )
        )
    
    # Style improvements
    fig.update_layout(
        hovermode="x unified",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        xaxis=dict(showgrid=False),
        yaxis=dict(showgrid=True, gridcolor="rgba(0,0,0,0.1)"),
        plot_bgcolor="white"
    )
    
    return fig

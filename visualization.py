import plotly.express as px
import plotly.graph_objects as go
import pandas as pd
import numpy as np

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
        title="LinkedIn Connections Growth Over Time",
        labels={"Connections": "Total Connections", "Date": ""},
        markers=True
    )
    
    # Add trendline
    fig.add_trace(
        go.Scatter(
            x=df["Date"],
            y=df["Connections"].rolling(window=7, min_periods=1).mean(),
            mode="lines",
            name="7-Day Moving Average",
            line=dict(color="rgba(10, 102, 194, 0.5)", width=2, dash="dash")
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
        title="LinkedIn Profile Views Over Time",
        labels={"Views": "Profile Views", "Date": ""},
        markers=True
    )
    
    # Add trendline
    fig.add_trace(
        go.Scatter(
            x=df["Date"],
            y=df["Views"].rolling(window=7, min_periods=1).mean(),
            mode="lines",
            name="7-Day Moving Average",
            line=dict(color="rgba(10, 102, 194, 0.5)", width=2, dash="dash")
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
        title="LinkedIn Search Appearances Over Time",
        labels={search_col: "Search Appearances", "Date": ""},
        markers=True
    )
    
    # Add trendline
    fig.add_trace(
        go.Scatter(
            x=df["Date"],
            y=df[search_col].rolling(window=7, min_periods=1).mean(),
            mode="lines",
            name="7-Day Moving Average",
            line=dict(color="rgba(10, 102, 194, 0.5)", width=2, dash="dash")
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
            line=dict(color="#0A66C2", width=3)
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
                line=dict(color="#057642", width=2, dash="dot")
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
                line=dict(color="#B24020", width=2, dash="dot")
            )
        )
    
    # Style the chart
    fig.update_layout(
        title="Social Selling Index (SSI) Over Time",
        hovermode="x unified",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        xaxis=dict(showgrid=False, title=""),
        yaxis=dict(
            showgrid=True, 
            gridcolor="rgba(0,0,0,0.1)",
            title="Score",
            range=[0, 100]
        ),
        plot_bgcolor="white"
    )
    
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
            line=dict(color="#0A66C2", width=2)
        )
    )
    
    # Add search appearances line
    fig.add_trace(
        go.Scatter(
            x=df["Date"],
            y=df[search_col],
            mode="lines+markers",
            name="Search Appearances",
            line=dict(color="#057642", width=2)
        )
    )
    
    # Style the chart
    fig.update_layout(
        title="Profile Views vs Search Appearances",
        hovermode="x unified",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        xaxis=dict(showgrid=False, title=""),
        yaxis=dict(showgrid=True, gridcolor="rgba(0,0,0,0.1)", title="Count"),
        plot_bgcolor="white"
    )
    
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
    
    # Create heatmap
    fig = px.imshow(
        corr_matrix,
        text_auto=True,
        color_continuous_scale='RdBu_r',
        zmin=-1, 
        zmax=1,
        title="Correlation Between LinkedIn Metrics"
    )
    
    # Improve layout
    fig.update_layout(
        width=500,
        height=500,
        plot_bgcolor="white"
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
        title=f"{metric} Over Time",
        labels={metric: metric, "Date": ""},
        markers=True
    )
    
    # Add trendline if enough data points
    if len(chart_df) >= 3:
        fig.add_trace(
            go.Scatter(
                x=chart_df["Date"],
                y=chart_df[metric].rolling(window=min(7, len(chart_df)), min_periods=1).mean(),
                mode="lines",
                name="Moving Average",
                line=dict(color="rgba(10, 102, 194, 0.5)", width=2, dash="dash")
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

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import numpy as np
import io

from linkedin_data_processor import process_linkedin_data, calculate_statistics
from visualization import (
    create_connections_chart,
    create_views_chart,
    create_search_appearances_chart, 
    create_ssi_chart,
    create_metrics_comparison_chart,
    create_heatmap,
    create_company_metrics_chart
)
from utils import display_error_message, format_metric_change

# Page configuration
st.set_page_config(
    page_title="LinkedIn Analytics Dashboard",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# App title and description
st.title("LinkedIn Analytics Dashboard")
st.markdown("""
This application helps you analyze your LinkedIn profile metrics over time.
Upload your LinkedIn data export CSV to get started.
""")

# File uploader
uploaded_file = st.file_uploader("Upload your LinkedIn data export (CSV format)", type="csv")

if uploaded_file is not None:
    try:
        # Process the uploaded file
        df = process_linkedin_data(uploaded_file)
        
        if df is None or df.empty:
            st.error("The uploaded file doesn't contain valid LinkedIn data. Please check your file and try again.")
        else:
            # Sidebar navigation
            st.sidebar.header("Navigation")
            
            # Category-based navigation
            category = st.sidebar.radio(
                "View by Category",
                ["Dashboard", "Invitations"]
            )
            
            # Date filter
            st.sidebar.header("Filter Data")
            
            min_date = df['Date'].min().date()
            max_date = df['Date'].max().date()
            
            # Calculate default date range (last 3 months if available)
            default_start_date = max(min_date, max_date - timedelta(days=90))
            
            start_date = st.sidebar.date_input("Start Date", default_start_date, min_value=min_date, max_value=max_date)
            end_date = st.sidebar.date_input("End Date", max_date, min_value=min_date, max_value=max_date)
            
            if start_date > end_date:
                st.sidebar.error("Start date must be before end date")
            else:
                # Filter the dataframe based on date range
                filtered_df = df[(df['Date'].dt.date >= start_date) & (df['Date'].dt.date <= end_date)]
                
                # Calculate statistics
                stats = calculate_statistics(filtered_df)
                
                # Main dashboard content
                st.header(f"LinkedIn Analytics: {category}")
                
                # Format metric changes
                connections_change = format_metric_change(stats['connections_change'], "absolute")
                views_change = format_metric_change(stats['views_change'], "absolute")
                search_change = format_metric_change(stats['search_change'], "absolute") 
                ssi_change = format_metric_change(stats['ssi_change'], "percentage")
                invitations_value = filtered_df['Invitations'].iloc[-1] if 'Invitations' in filtered_df.columns else 0
                invitations_change = int(filtered_df['Invitations'].iloc[-1] - filtered_df['Invitations'].iloc[0]) if 'Invitations' in filtered_df.columns else 0
                invitations_change_formatted = format_metric_change(invitations_change, "absolute")
                
                # Display content based on selected category
                if category == "Dashboard":
                    # Key metrics for dashboard
                    col1, col2, col3, col4 = st.columns(4)
                    
                    with col1:
                        st.metric(
                            label="Total Connections", 
                            value=stats['latest_connections'],
                            delta=connections_change
                        )
                    
                    with col2:
                        st.metric(
                            label="Profile Views", 
                            value=stats['latest_views'],
                            delta=views_change
                        )
                    
                    with col3:
                        st.metric(
                            label="Search Appearances", 
                            value=stats['latest_search'],
                            delta=search_change
                        )
                    
                    with col4:
                        st.metric(
                            label="SSI Score", 
                            value=f"{stats['latest_ssi']}/100",
                            delta=ssi_change
                        )
                    
                    # Dashboard with 6 graphs
                    st.subheader("LinkedIn Performance Dashboard")
                    
                    # Grid layout for 6 graphs - 3 rows x 2 columns
                    row1_col1, row1_col2 = st.columns(2)
                    row2_col1, row2_col2 = st.columns(2)
                    row3_col1, row3_col2 = st.columns(2)
                    
                    with row1_col1:
                        st.markdown("### Network Growth")
                        st.plotly_chart(create_connections_chart(filtered_df), use_container_width=True)
                        
                    with row1_col2:
                        st.markdown("### Profile Views & Search Appearances")
                        st.plotly_chart(create_metrics_comparison_chart(filtered_df), use_container_width=True)
                    
                    with row2_col1:
                        st.markdown("### SSI Score Evolution")
                        st.plotly_chart(create_ssi_chart(filtered_df), use_container_width=True)
                        
                    with row2_col2:
                        st.markdown("### Metrics Correlation")
                        st.plotly_chart(create_heatmap(filtered_df), use_container_width=True)
                    
                    with row3_col1:
                        # Pending Invitations chart if exists
                        if 'Invitations' in filtered_df.columns:
                            st.markdown("### Pending Invitations")
                            fig = px.line(
                                filtered_df, 
                                x="Date", 
                                y="Invitations",
                                title="Pending Invitations Over Time",
                                labels={"Invitations": "Pending Invitations", "Date": ""},
                                markers=True
                            )
                            
                            # Add trendline
                            fig.add_trace(
                                go.Scatter(
                                    x=filtered_df["Date"],
                                    y=filtered_df["Invitations"].rolling(window=7, min_periods=1).mean(),
                                    mode="lines",
                                    name="7-Day Average",
                                    line=dict(color="rgba(10, 102, 194, 0.5)", width=2, dash="dash")
                                )
                            )
                            
                            # Style improvements
                            fig.update_layout(
                                hovermode="x unified",
                                legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
                                xaxis=dict(showgrid=False),
                                yaxis=dict(showgrid=True, gridcolor="rgba(0,0,0,0.1)"),
                                plot_bgcolor="white",
                                height=300
                            )
                            
                            st.plotly_chart(fig, use_container_width=True)
                        else:
                            st.info("No invitations data available.")
                    
                    with row3_col2:
                        # Company data if exists
                        if 'Company Followers' in filtered_df.columns and filtered_df['Company Followers'].notna().any():
                            st.markdown("### Company Growth")
                            st.plotly_chart(
                                create_company_metrics_chart(filtered_df, "Company Followers"), 
                                use_container_width=True
                            )
                        else:
                            st.markdown("### Key Performance Metrics")
                            # Show a summary of key metrics instead
                            st.markdown(f"""
                            - **Average daily connection growth:** {stats['avg_connections_growth']:.2f} connections/day
                            - **Projected monthly growth:** {stats['projected_monthly_growth']:.0f} connections/month
                            - **Average Profile Views:** {stats['avg_views']:.1f} views/day
                            - **Average Search Appearances:** {stats['avg_search']:.1f} appearances/day
                            - **View to Connection Ratio:** {stats['view_connection_ratio']:.2f} views per new connection
                            - **Average SSI Score:** {stats['avg_ssi']:.1f}/100
                            """)
                
                elif category == "Invitations":
                    # Invitations specific metrics
                    if 'Invitations' in filtered_df.columns:
                        st.subheader("LinkedIn Invitations Analysis")
                        
                        # Top metrics
                        col1, col2, col3 = st.columns(3)
                        
                        with col1:
                            st.metric(
                                label="Current Pending Invitations", 
                                value=invitations_value,
                                delta=invitations_change_formatted
                            )
                        
                        with col2:
                            st.metric(
                                label="Connections", 
                                value=stats['latest_connections'],
                                delta=connections_change
                            )
                        
                        with col3:
                            # Calculate connection requests ratio (if connections are growing)
                            if stats['connections_change'] > 0:
                                invitation_connection_ratio = invitations_value / stats['connections_change']
                                st.metric(
                                    label="Invitation/Connection Ratio", 
                                    value=f"{invitation_connection_ratio:.2f}",
                                    help="Number of pending invitations per new connection"
                                )
                            else:
                                st.metric(
                                    label="Invitation/Connection Ratio", 
                                    value="N/A",
                                    help="Requires connection growth to calculate"
                                )
                        
                        # Create invitations chart
                        st.subheader("Invitations Trend Analysis")
                        
                        col1, col2 = st.columns([2, 1])
                        
                        with col1:
                            # Main invitations chart 
                            fig = px.line(
                                filtered_df, 
                                x="Date", 
                                y="Invitations",
                                title="LinkedIn Pending Invitations Over Time",
                                labels={"Invitations": "Pending Invitations", "Date": ""},
                                markers=True
                            )
                            
                            # Add trendline
                            fig.add_trace(
                                go.Scatter(
                                    x=filtered_df["Date"],
                                    y=filtered_df["Invitations"].rolling(window=7, min_periods=1).mean(),
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
                            
                            st.plotly_chart(fig, use_container_width=True)
                        
                        with col2:
                            # Insights about invitations
                            st.markdown("### Invitation Insights")
                            st.markdown(f"""
                            - **Current Pending Invitations:** {invitations_value}
                            - **Change in Period:** {invitations_change}
                            - **Average Pending Invitations:** {filtered_df['Invitations'].mean():.1f}
                            - **Maximum Pending:** {filtered_df['Invitations'].max():.0f}
                            - **Minimum Pending:** {filtered_df['Invitations'].min():.0f}
                            """)
                        
                        # Invitations vs Connections
                        st.subheader("Invitations vs Connections")
                        
                        # Create a figure for comparing invitations and connections
                        fig = go.Figure()
                        
                        # Normalize the values for better comparison (percent of max value for each)
                        inv_norm = filtered_df['Invitations'] / filtered_df['Invitations'].max() * 100
                        conn_norm = filtered_df['Connections'] / filtered_df['Connections'].max() * 100
                        
                        # Add Invitations
                        fig.add_trace(
                            go.Scatter(
                                x=filtered_df["Date"],
                                y=inv_norm,
                                mode="lines+markers",
                                name="Pending Invitations",
                                line=dict(color="rgba(255, 127, 14, 0.8)", width=2)
                            )
                        )
                        
                        # Add Connections
                        fig.add_trace(
                            go.Scatter(
                                x=filtered_df["Date"],
                                y=conn_norm,
                                mode="lines+markers",
                                name="Connections",
                                line=dict(color="rgba(31, 119, 180, 0.8)", width=2)
                            )
                        )
                        
                        # Style the figure
                        fig.update_layout(
                            title="Normalized Comparison: Invitations vs Connections Growth",
                            hovermode="x unified",
                            xaxis=dict(title="Date", showgrid=False),
                            yaxis=dict(
                                title="Percentage of Maximum Value", 
                                showgrid=True, 
                                gridcolor="rgba(0,0,0,0.1)",
                                ticksuffix="%"
                            ),
                            plot_bgcolor="white",
                            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
                        )
                        
                        st.plotly_chart(fig, use_container_width=True)
                        
                        # Add explanation of normalized visualization
                        st.info("""
                        **About the Normalized Comparison Chart**: This chart shows both invitations and connections on the same scale (as a percentage of their maximum value) to help visualize the relationship between pending invitations and your total connections over time.
                        """)
                        
                    else:
                        st.info("No invitations data available in the uploaded file. LinkedIn data export must include the 'Invitations' column to display this analysis.")
                
                # Remove old tab code - we don't need this anymore with the new Dashboard layout
                
                # Download the filtered data
                st.sidebar.header("Export Data")
                
                excel_buffer = io.BytesIO()
                with pd.ExcelWriter(excel_buffer, engine="xlsxwriter") as writer:
                    filtered_df.to_excel(writer, sheet_name="LinkedIn Data", index=False)
                
                st.sidebar.download_button(
                    label="Download Filtered Data (Excel)",
                    data=excel_buffer.getvalue(),
                    file_name=f"linkedin_data_{start_date}_to_{end_date}.xlsx",
                    mime="application/vnd.ms-excel"
                )
                
    except Exception as e:
        display_error_message(f"An error occurred while processing the file: {str(e)}")

else:
    # Sample data visualization to guide users
    st.info("👆 Upload your LinkedIn data export to get started with the analysis")
    
    # Instructions for obtaining LinkedIn data
    st.header("How to obtain your LinkedIn data")
    st.markdown("""
    1. Sign in to your LinkedIn account
    2. Click on your profile picture in the top right corner
    3. Select **Settings & Privacy**
    4. Go to the **Data Privacy** section
    5. Click on **Get a copy of your data**
    6. Select **The works** or custom download with at least profile metrics
    7. Request archive and download when ready
    8. Upload the CSV file containing your profile metrics to this app
    """)
    
    # Expected format information
    st.header("Expected CSV Format")
    st.markdown("""
    The uploaded CSV should contain LinkedIn profile metrics with columns similar to:
    - Date
    - Connections
    - Search Appearance
    - Views
    - Invitations
    - SSI Industry
    - SSI Network
    - SSI
    
    Additional company metrics columns may include:
    - Company Followers
    - Company Search Appearances
    - Company Unique Visitors
    - Company New Followers
    - Company Post Impressions
    """)

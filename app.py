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
                ["Overview", "Connections", "Profile Views", "SSI Score", "Invitations"]
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
                if category == "Overview":
                    # Key metrics for overview
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
                    
                    # Tabs for different visualization sections in overview
                    tab1, tab2, tab3, tab4 = st.tabs(["Network Growth", "Profile Visibility", "SSI Analysis", "Company Metrics"])
                
                elif category == "Connections":
                    # Connections specific metrics
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        st.metric(
                            label="Total Connections", 
                            value=stats['latest_connections'],
                            delta=connections_change
                        )
                    
                    with col2:
                        st.metric(
                            label="Pending Invitations", 
                            value=invitations_value,
                            delta=invitations_change_formatted
                        )
                    
                    # Connections chart
                    st.subheader("Network Growth Analysis")
                    st.plotly_chart(create_connections_chart(filtered_df), use_container_width=True)
                    
                    # Network growth metrics
                    left_col, right_col = st.columns(2)
                    with left_col:
                        st.markdown(f"**Average daily connection growth:** {stats['avg_connections_growth']:.2f} connections/day")
                        st.markdown(f"**Total growth period:** {(end_date - start_date).days} days")
                    
                    with right_col:
                        st.markdown(f"**Projected monthly growth:** {stats['projected_monthly_growth']:.0f} connections/month")
                        st.markdown(f"**Projected annual growth:** {stats['projected_annual_growth']:.0f} connections/year")
                
                elif category == "Profile Views":
                    # Profile views specific metrics
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        st.metric(
                            label="Profile Views", 
                            value=stats['latest_views'],
                            delta=views_change
                        )
                    
                    with col2:
                        st.metric(
                            label="Search Appearances", 
                            value=stats['latest_search'],
                            delta=search_change
                        )
                    
                    # Profile views charts
                    st.subheader("Profile Visibility Analysis")
                    
                    views_tab1, views_tab2, views_tab3 = st.tabs(["Both Metrics", "Profile Views", "Search Appearances"])
                    
                    with views_tab1:
                        st.plotly_chart(create_metrics_comparison_chart(filtered_df), use_container_width=True)
                    
                    with views_tab2:
                        st.plotly_chart(create_views_chart(filtered_df), use_container_width=True)
                    
                    with views_tab3:
                        st.plotly_chart(create_search_appearances_chart(filtered_df), use_container_width=True)
                    
                    # Correlation analysis
                    st.subheader("Correlation Between Metrics")
                    left_col, right_col = st.columns([1, 1])
                    
                    with left_col:
                        st.plotly_chart(create_heatmap(filtered_df), use_container_width=True)
                    
                    with right_col:
                        st.markdown("### Visibility Insights")
                        st.markdown(f"""
                        - **Average Profile Views:** {stats['avg_views']:.1f} views/day
                        - **Average Search Appearances:** {stats['avg_search']:.1f} appearances/day
                        - **View to Connection Ratio:** {stats['view_connection_ratio']:.2f} (views per new connection)
                        """)
                
                elif category == "SSI Score":
                    # SSI specific metrics
                    col1, col2, col3 = st.columns(3)
                    
                    with col1:
                        st.metric(
                            label="Current SSI Score", 
                            value=f"{stats['latest_ssi']}/100",
                            delta=ssi_change
                        )
                    
                    with col2:
                        st.metric(
                            label="Industry Ranking", 
                            value=f"{filtered_df['SSI Industry'].iloc[-1]}" if 'SSI Industry' in filtered_df.columns else "N/A"
                        )
                    
                    with col3:
                        st.metric(
                            label="Network Ranking", 
                            value=f"{filtered_df['SSI Network'].iloc[-1]}" if 'SSI Network' in filtered_df.columns else "N/A"
                        )
                    
                    # SSI chart
                    st.subheader("Social Selling Index (SSI) Analysis")
                    st.plotly_chart(create_ssi_chart(filtered_df), use_container_width=True)
                    
                    # SSI components
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        st.markdown("### SSI Components Analysis")
                        st.markdown(f"""
                        - **Industry Ranking:** {stats['avg_ssi_industry']:.1f}
                        - **Network Ranking:** {stats['avg_ssi_network']:.1f}
                        """)
                    
                    with col2:
                        st.markdown("### SSI Insights")
                        st.markdown(f"""
                        - **Average SSI Score:** {stats['avg_ssi']:.1f}/100
                        - **Max SSI Score:** {stats['max_ssi']}/100
                        """)
                    
                    st.markdown("""
                    ### What is SSI?
                    The Social Selling Index (SSI) measures how effective you are at establishing your professional brand, 
                    finding the right people, engaging with insights, and building relationships. It is updated daily and 
                    ranges from 1 to 100.
                    """)
                
                elif category == "Invitations":
                    # Invitations specific metrics
                    if 'Invitations' in filtered_df.columns:
                        col1, col2 = st.columns(2)
                        
                        with col1:
                            st.metric(
                                label="Pending Invitations", 
                                value=invitations_value,
                                delta=invitations_change_formatted
                            )
                        
                        with col2:
                            st.metric(
                                label="Connections", 
                                value=stats['latest_connections'],
                                delta=connections_change
                            )
                        
                        # Create invitations chart
                        st.subheader("Invitations Over Time")
                        
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
                        
                        # Insights about invitations
                        st.markdown("### Invitation Insights")
                        st.markdown(f"""
                        - **Current Pending Invitations:** {invitations_value}
                        - **Change in Pending Invitations:** {invitations_change}
                        - **Average Pending Invitations:** {filtered_df['Invitations'].mean():.1f}
                        """)
                    else:
                        st.info("No invitations data available in the uploaded file.")
                
                # Only show tabs for Overview category
                if category == "Overview":
                    # Tabs for different visualization sections
                    with tab1:
                        st.subheader("Network Growth Analysis")
                        
                        # Connections over time
                        st.plotly_chart(create_connections_chart(filtered_df), use_container_width=True)
                        
                        # Network growth metrics
                        left_col, right_col = st.columns(2)
                        with left_col:
                            st.markdown(f"**Average daily connection growth:** {stats['avg_connections_growth']:.2f} connections/day")
                            st.markdown(f"**Total growth period:** {(end_date - start_date).days} days")
                        
                        with right_col:
                            st.markdown(f"**Projected monthly growth:** {stats['projected_monthly_growth']:.0f} connections/month")
                            st.markdown(f"**Projected annual growth:** {stats['projected_annual_growth']:.0f} connections/year")
                    
                    with tab2:
                        st.subheader("Profile Visibility Metrics")
                        visibility_metric = st.selectbox(
                            "Select Visibility Metric", 
                            ["Both Metrics", "Profile Views", "Search Appearances"]
                        )
                        
                        if visibility_metric == "Both Metrics":
                            st.plotly_chart(create_metrics_comparison_chart(filtered_df), use_container_width=True)
                        elif visibility_metric == "Profile Views":
                            st.plotly_chart(create_views_chart(filtered_df), use_container_width=True)
                        else:
                            st.plotly_chart(create_search_appearances_chart(filtered_df), use_container_width=True)
                        
                        # Correlation heatmap
                        st.subheader("Correlation Between Metrics")
                        st.plotly_chart(create_heatmap(filtered_df), use_container_width=True)
                        
                        # Insights about visibility
                        st.markdown("### Visibility Insights")
                        st.markdown(f"""
                        - **Average Profile Views:** {stats['avg_views']:.1f} views/day
                        - **Average Search Appearances:** {stats['avg_search']:.1f} appearances/day
                        - **View to Connection Ratio:** {stats['view_connection_ratio']:.2f} (views per new connection)
                        """)
                    
                    with tab3:
                        st.subheader("Social Selling Index (SSI) Analysis")
                        
                        # SSI chart
                        st.plotly_chart(create_ssi_chart(filtered_df), use_container_width=True)
                        
                        # SSI components
                        col1, col2 = st.columns(2)
                        
                        with col1:
                            st.markdown("### SSI Components Analysis")
                            st.markdown(f"""
                            - **Industry Ranking:** {stats['avg_ssi_industry']:.1f}
                            - **Network Ranking:** {stats['avg_ssi_network']:.1f}
                            """)
                        
                        with col2:
                            st.markdown("### SSI Insights")
                            st.markdown(f"""
                            - **Average SSI Score:** {stats['avg_ssi']:.1f}/100
                            - **Max SSI Score:** {stats['max_ssi']}/100
                            """)
                    
                    with tab4:
                        # Check if company data exists
                        if 'Company Followers' in filtered_df.columns and filtered_df['Company Followers'].notna().any():
                            st.subheader("Company Metrics Analysis")
                            company_metric = st.selectbox(
                                "Select Company Metric",
                                ["Company Followers", "Company Search Appearances", "Company Unique Visitors", 
                                 "Company New Followers", "Company Post Impressions"]
                            )
                            
                            st.plotly_chart(create_company_metrics_chart(filtered_df, company_metric), use_container_width=True)
                            
                            # Company insights
                            st.markdown("### Company Growth Insights")
                            
                            # Calculate some basic company metrics if data is available
                            if "Company New Followers" in filtered_df.columns and filtered_df["Company New Followers"].notna().any():
                                avg_new_followers = filtered_df["Company New Followers"].mean()
                                st.markdown(f"- **Average New Followers Per Day:** {avg_new_followers:.1f}")
                            
                            if "Company Post Impressions" in filtered_df.columns and filtered_df["Company Post Impressions"].notna().any():
                                avg_impressions = filtered_df["Company Post Impressions"].mean()
                                st.markdown(f"- **Average Post Impressions Per Day:** {avg_impressions:.1f}")
                            
                            if "Company Unique Visitors" in filtered_df.columns and filtered_df["Company Unique Visitors"].notna().any():
                                avg_visitors = filtered_df["Company Unique Visitors"].mean()
                                st.markdown(f"- **Average Unique Visitors Per Day:** {avg_visitors:.1f}")
                        else:
                            st.info("No company metrics data available in the uploaded file.")
                
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

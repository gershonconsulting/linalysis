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
    page_title="Linalysis Dashboard",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# App title and description
st.title("Linalysis Dashboard")
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
                ["Dashboard", "Connections", "Profile Views", "Search Appearances", "SSI Score", "Invitations", 
                 "Reports", "Settings", "Billing"]
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
                st.header(f"Linalysis: {category}")
                
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
                    st.subheader("Linalysis Performance Dashboard")
                    
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
                
                elif category == "Connections":
                    # Connections specific metrics
                    st.subheader("Linalysis Connections Analysis")
                    
                    # Top metrics row
                    col1, col2, col3, col4 = st.columns(4)
                    
                    with col1:
                        st.metric(
                            label="Total Connections", 
                            value=stats['latest_connections'],
                            delta=connections_change
                        )
                    
                    with col2:
                        st.metric(
                            label="Min Connections", 
                            value=int(filtered_df['Connections'].min())
                        )
                    
                    with col3:
                        st.metric(
                            label="Max Connections", 
                            value=int(filtered_df['Connections'].max())
                        )
                    
                    with col4:
                        st.metric(
                            label="Average Connections", 
                            value=f"{filtered_df['Connections'].mean():.1f}"
                        )
                    
                    # Main connections chart
                    st.subheader("Network Growth Over Time")
                    st.plotly_chart(create_connections_chart(filtered_df), use_container_width=True)
                    
                    # Weekly and monthly views in two columns
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        # Create weekly growth summary
                        st.subheader("Weekly Connections Growth")
                        
                        # Resample by week and calculate the difference
                        weekly_data = filtered_df.set_index('Date')[['Connections']].resample('W').last()
                        weekly_data['Weekly_Growth'] = weekly_data['Connections'].diff()
                        
                        # Replace NaN values in first row
                        weekly_data['Weekly_Growth'] = weekly_data['Weekly_Growth'].fillna(0)
                        
                        # Create weekly growth bar chart
                        fig = px.bar(
                            weekly_data.reset_index(), 
                            x="Date", 
                            y="Weekly_Growth",
                            labels={"Weekly_Growth": "New Connections", "Date": "Week"},
                            title="Weekly Connections Growth",
                            color_discrete_sequence=["rgba(10, 102, 194, 0.8)"]
                        )
                        
                        # Improve the layout
                        fig.update_layout(
                            xaxis=dict(showgrid=False),
                            yaxis=dict(showgrid=True, gridcolor="rgba(0,0,0,0.1)"),
                            plot_bgcolor="white"
                        )
                        
                        st.plotly_chart(fig, use_container_width=True)
                        
                        # Weekly growth statistics
                        weekly_growth = weekly_data['Weekly_Growth']
                        st.markdown(f"""
                        ### Weekly Growth Statistics
                        - **Average weekly growth:** {weekly_growth.mean():.2f} connections/week
                        - **Max weekly growth:** {weekly_growth.max():.0f} connections
                        - **Min weekly growth:** {weekly_growth.min():.0f} connections
                        - **Median weekly growth:** {weekly_growth.median():.1f} connections
                        """)
                    
                    with col2:
                        # Create monthly growth summary
                        st.subheader("Monthly Connections Growth")
                        
                        # Resample by month and calculate the difference
                        monthly_data = filtered_df.set_index('Date')[['Connections']].resample('M').last()
                        monthly_data['Monthly_Growth'] = monthly_data['Connections'].diff()
                        
                        # Replace NaN values in first row
                        monthly_data['Monthly_Growth'] = monthly_data['Monthly_Growth'].fillna(0)
                        
                        # Create monthly growth bar chart
                        fig = px.bar(
                            monthly_data.reset_index(), 
                            x="Date", 
                            y="Monthly_Growth",
                            labels={"Monthly_Growth": "New Connections", "Date": "Month"},
                            title="Monthly Connections Growth",
                            color_discrete_sequence=["rgba(44, 160, 44, 0.8)"]
                        )
                        
                        # Improve the layout
                        fig.update_layout(
                            xaxis=dict(
                                showgrid=False,
                                tickformat="%b %Y"  # Format as "Jan 2025" etc.
                            ),
                            yaxis=dict(showgrid=True, gridcolor="rgba(0,0,0,0.1)"),
                            plot_bgcolor="white"
                        )
                        
                        st.plotly_chart(fig, use_container_width=True)
                        
                        # Monthly growth statistics
                        monthly_growth = monthly_data['Monthly_Growth']
                        st.markdown(f"""
                        ### Monthly Growth Statistics
                        - **Average monthly growth:** {monthly_growth.mean():.2f} connections/month
                        - **Max monthly growth:** {monthly_growth.max():.0f} connections
                        - **Min monthly growth:** {monthly_growth.min():.0f} connections
                        - **Median monthly growth:** {monthly_growth.median():.1f} connections
                        """)
                    
                    # Network growth metrics
                    st.subheader("Network Growth Projections")
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        st.markdown(f"""
                        ### Growth Metrics
                        - **Average daily growth:** {stats['avg_connections_growth']:.2f} connections/day
                        - **Total connections gained:** {stats['connections_change']} connections
                        - **Growth period:** {(end_date - start_date).days} days
                        - **Connections on {start_date}:** {filtered_df['Connections'].iloc[0]}
                        - **Connections on {end_date}:** {filtered_df['Connections'].iloc[-1]}
                        """)
                    
                    with col2:
                        st.markdown(f"""
                        ### Growth Projections
                        - **Projected weekly growth:** {stats['avg_connections_growth'] * 7:.1f} connections/week
                        - **Projected monthly growth:** {stats['projected_monthly_growth']:.0f} connections/month
                        - **Projected annual growth:** {stats['projected_annual_growth']:.0f} connections/year
                        - **Days to reach next 100:** {100 / stats['avg_connections_growth']:.0f} days
                        - **Days to reach next 500:** {500 / stats['avg_connections_growth']:.0f} days
                        """)
                        
                    # Add period comparisons, conclusions and recommendations
                    st.subheader("Insights & Recommendations")
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        # Calculate growth rates for different periods
                        week_change_pct = stats.get('connections_week_pct_change', 0)
                        month_change_pct = stats.get('connections_month_pct_change', 0)
                        week_change = stats.get('connections_week_change', 0)
                        month_change = stats.get('connections_month_change', 0)
                        
                        # Colors for trends
                        week_color = "green" if week_change > 0 else "red" if week_change < 0 else "gray"
                        month_color = "green" if month_change > 0 else "red" if month_change < 0 else "gray"
                        
                        st.markdown(f"""
                        ### Network Growth Analysis
                        
                        #### Weekly Comparison
                        <span style="color:{week_color}">**{week_change:+.0f} connections**</span> in the last week 
                        ({week_change_pct:.1f}% change)
                        
                        #### Monthly Comparison
                        <span style="color:{month_color}">**{month_change:+.0f} connections**</span> in the last month 
                        ({month_change_pct:.1f}% change)
                        
                        #### Key Insights
                        - Your network is growing at **{stats['avg_connections_growth']:.1f} connections per day**
                        - At this rate, you'll reach **{filtered_df['Connections'].iloc[-1] + stats['projected_monthly_growth']:.0f} connections** in 30 days
                        - Your growth is **{week_change_pct:.1f}% {week_change >= 0 and 'up' or 'down'}** compared to last week
                        """, unsafe_allow_html=True)
                    
                    with col2:
                        # Generate recommendations based on growth patterns
                        growth_level = "strong" if stats['avg_connections_growth'] > 5 else "moderate" if stats['avg_connections_growth'] > 1 else "slow"
                        growth_trend = "accelerating" if week_change > month_change/4 else "steady" if week_change > 0 else "slowing"
                        
                        st.markdown(f"""
                        ### Recommendations
                        
                        #### Network Building Strategy
                        - **Connection Quality**: {'Focus on quality over quantity' if growth_level == 'strong' else 'Increase your connection outreach'}
                        - **Engagement Level**: {'Engage more with your existing network' if growth_level == 'strong' else 'Engage with new connections to strengthen relationships'}
                        - **Posting Frequency**: {'Share insights to attract more connections' if growth_level == 'slow' else 'Continue your content strategy'}
                        
                        #### Action Items
                        1. {'Follow up with recent connections' if week_change > 0 else 'Reach out to former colleagues'}
                        2. {'Join industry groups to expand your reach' if growth_trend == 'slowing' else 'Comment on posts from your network'}
                        3. {'Share content that showcases your expertise' if growth_level != 'strong' else 'Consider connecting with 2nd-degree connections'}
                        4. {'Update your profile headline to attract more connections' if growth_level == 'slow' else 'Focus on meaningful conversations with your network'}
                        """)
                
                elif category == "Profile Views":
                    # Profile views specific metrics
                    st.subheader("Linalysis Profile Views Analysis")
                    
                    # Top metrics row
                    col1, col2, col3, col4 = st.columns(4)
                    
                    with col1:
                        st.metric(
                            label="Current Views", 
                            value=stats['latest_views'],
                            delta=views_change
                        )
                    
                    with col2:
                        st.metric(
                            label="Min Views", 
                            value=int(filtered_df['Views'].min())
                        )
                    
                    with col3:
                        st.metric(
                            label="Max Views", 
                            value=int(filtered_df['Views'].max())
                        )
                    
                    with col4:
                        st.metric(
                            label="Average Views", 
                            value=f"{filtered_df['Views'].mean():.1f}"
                        )
                    
                    # Main profile views chart
                    st.subheader("Profile Views Over Time")
                    st.plotly_chart(create_views_chart(filtered_df), use_container_width=True)
                    
                    # Weekly and monthly views in two columns
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        # Create weekly views summary
                        st.subheader("Weekly Profile Views")
                        
                        # Resample by week
                        weekly_data = filtered_df.set_index('Date')[['Views']].resample('W').sum()
                        
                        # Create weekly views bar chart
                        fig = px.bar(
                            weekly_data.reset_index(), 
                            x="Date", 
                            y="Views",
                            labels={"Views": "Profile Views", "Date": "Week"},
                            title="Weekly Profile Views",
                            color_discrete_sequence=["rgba(214, 39, 40, 0.8)"]
                        )
                        
                        # Improve the layout
                        fig.update_layout(
                            xaxis=dict(showgrid=False),
                            yaxis=dict(showgrid=True, gridcolor="rgba(0,0,0,0.1)"),
                            plot_bgcolor="white"
                        )
                        
                        st.plotly_chart(fig, use_container_width=True)
                        
                        # Weekly views statistics
                        weekly_views = weekly_data['Views']
                        st.markdown(f"""
                        ### Weekly Views Statistics
                        - **Average weekly views:** {weekly_views.mean():.2f} views/week
                        - **Max weekly views:** {weekly_views.max():.0f} views
                        - **Min weekly views:** {weekly_views.min():.0f} views
                        - **Median weekly views:** {weekly_views.median():.1f} views
                        """)
                    
                    with col2:
                        # Create monthly views summary
                        st.subheader("Monthly Profile Views")
                        
                        # Resample by month
                        monthly_data = filtered_df.set_index('Date')[['Views']].resample('M').sum()
                        
                        # Create monthly views bar chart
                        fig = px.bar(
                            monthly_data.reset_index(), 
                            x="Date", 
                            y="Views",
                            labels={"Views": "Profile Views", "Date": "Month"},
                            title="Monthly Profile Views",
                            color_discrete_sequence=["rgba(148, 103, 189, 0.8)"]
                        )
                        
                        # Improve the layout
                        fig.update_layout(
                            xaxis=dict(
                                showgrid=False,
                                tickformat="%b %Y"  # Format as "Jan 2025" etc.
                            ),
                            yaxis=dict(showgrid=True, gridcolor="rgba(0,0,0,0.1)"),
                            plot_bgcolor="white"
                        )
                        
                        st.plotly_chart(fig, use_container_width=True)
                        
                        # Monthly views statistics
                        monthly_views = monthly_data['Views']
                        st.markdown(f"""
                        ### Monthly Views Statistics
                        - **Average monthly views:** {monthly_views.mean():.2f} views/month
                        - **Max monthly views:** {monthly_views.max():.0f} views
                        - **Min monthly views:** {monthly_views.min():.0f} views
                        - **Median monthly views:** {monthly_views.median():.1f} views
                        """)
                    
                    # Correlation with other metrics
                    st.subheader("Relationship with Other Metrics")
                    
                    # Correlation heatmap
                    st.plotly_chart(create_heatmap(filtered_df), use_container_width=True)
                    
                    # Additional insights
                    st.subheader("Profile Views Insights")
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        st.markdown(f"""
                        ### Views Efficiency Metrics
                        - **Views per connection:** {stats['view_connection_ratio']:.2f} views per new connection
                        - **Daily average views:** {stats['avg_views']:.1f} views/day
                        - **Total views in period:** {filtered_df['Views'].sum()} views
                        - **Days with zero views:** {(filtered_df['Views'] == 0).sum()} days
                        - **Max views in a day:** {filtered_df['Views'].max()} views
                        """)
                    
                    with col2:
                        # Create day of week analysis
                        if len(filtered_df) >= 7:  # Only if we have enough data
                            # Add day of week column
                            day_data = filtered_df.copy()
                            day_data['Day_of_Week'] = day_data['Date'].dt.day_name()
                            
                            # Get average views by day of week
                            day_avg = day_data.groupby('Day_of_Week')['Views'].mean().reindex([
                                'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
                            ])
                            
                            # Create day of week bar chart
                            fig = px.bar(
                                x=day_avg.index, 
                                y=day_avg.values,
                                labels={"x": "Day of Week", "y": "Average Views"},
                                title="Average Views by Day of Week",
                                color_discrete_sequence=["rgba(214, 39, 40, 0.8)"]
                            )
                            
                            # Improve the layout
                            fig.update_layout(
                                xaxis=dict(showgrid=False),
                                yaxis=dict(showgrid=True, gridcolor="rgba(0,0,0,0.1)"),
                                plot_bgcolor="white"
                            )
                            
                            st.plotly_chart(fig, use_container_width=True)
                        else:
                            st.info("Need at least 7 days of data to show day-of-week analysis.")
                            
                    # Add period comparisons, conclusions and recommendations
                    st.subheader("Profile Views Insights & Recommendations")
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        # Calculate changes for different periods
                        week_change_pct = stats.get('views_week_pct_change', 0)
                        month_change_pct = stats.get('views_month_pct_change', 0)
                        week_change = stats.get('views_week_change', 0)
                        month_change = stats.get('views_month_change', 0)
                        
                        # Colors for trends
                        week_color = "green" if week_change > 0 else "red" if week_change < 0 else "gray"
                        month_color = "green" if month_change > 0 else "red" if month_change < 0 else "gray"
                        
                        st.markdown(f"""
                        ### Profile Visibility Analysis
                        
                        #### Weekly Comparison
                        <span style="color:{week_color}">**{week_change:+.0f} views**</span> in the last week 
                        ({week_change_pct:.1f}% change)
                        
                        #### Monthly Comparison
                        <span style="color:{month_color}">**{month_change:+.0f} views**</span> in the last month 
                        ({month_change_pct:.1f}% change)
                        
                        #### Key Insights
                        - Your profile is getting **{stats['avg_views']:.1f} views per day** on average
                        - You get about **{stats['view_connection_ratio']:.1f} views** for each new connection
                        - Peak viewing occurs on **{day_avg.idxmax() if len(filtered_df) >= 7 else 'weekdays'}**
                        - Your profile visits are **{week_change_pct:.1f}% {week_change >= 0 and 'up' or 'down'}** compared to last week
                        """, unsafe_allow_html=True)
                    
                    with col2:
                        # Generate recommendations based on view patterns
                        view_level = "high" if stats['avg_views'] > 10 else "moderate" if stats['avg_views'] > 3 else "low"
                        view_trend = "improving" if week_change > 0 else "declining" if week_change < 0 else "stable"
                        best_day = day_avg.idxmax() if len(filtered_df) >= 7 else "weekdays"
                        
                        st.markdown(f"""
                        ### Recommendations
                        
                        #### Profile Optimization
                        - **Profile Completeness**: {'Maintain your complete profile' if view_level != 'low' else 'Add more detail to your experience section'}
                        - **Headline Impact**: {'Your headline is working well' if view_level == 'high' else 'Optimize your headline with relevant keywords'}
                        - **Profile Photo**: {'Your photo is attracting views' if view_level != 'low' else 'Consider updating your profile photo'}
                        
                        #### Action Items
                        1. {'Post content on ' + best_day + ' for maximum visibility' if len(filtered_df) >= 7 else 'Post content regularly to increase visibility'}
                        2. {'Engage with others content to maintain visibility' if view_trend != 'declining' else 'Comment on popular posts in your industry'}
                        3. {'Add media to your featured section' if view_level == 'low' else 'Update your featured content to keep profile fresh'}
                        4. {'Request recommendations to strengthen your profile' if view_level != 'high' else 'Consider publishing articles on LinkedIn'}
                        """)
                
                elif category == "Search Appearances":
                    # Search appearances specific metrics
                    st.subheader("Linalysis Search Appearances Analysis")
                    
                    # Top metrics row
                    col1, col2, col3, col4 = st.columns(4)
                    
                    with col1:
                        st.metric(
                            label="Current Appearances", 
                            value=stats['latest_search'],
                            delta=search_change
                        )
                    
                    with col2:
                        st.metric(
                            label="Min Appearances", 
                            value=int(filtered_df['Search Appearance'].min())
                        )
                    
                    with col3:
                        st.metric(
                            label="Max Appearances", 
                            value=int(filtered_df['Search Appearance'].max())
                        )
                    
                    with col4:
                        st.metric(
                            label="Average Appearances", 
                            value=f"{filtered_df['Search Appearance'].mean():.1f}"
                        )
                    
                    # Main search appearances chart
                    st.subheader("Search Appearances Over Time")
                    st.plotly_chart(create_search_appearances_chart(filtered_df), use_container_width=True)
                    
                    # Weekly and monthly appearances in two columns
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        # Create weekly appearances summary
                        st.subheader("Weekly Search Appearances")
                        
                        # Resample by week
                        weekly_data = filtered_df.set_index('Date')[['Search Appearance']].resample('W').sum()
                        
                        # Create weekly appearances bar chart
                        fig = px.bar(
                            weekly_data.reset_index(), 
                            x="Date", 
                            y="Search Appearance",
                            labels={"Search Appearance": "Appearances", "Date": "Week"},
                            title="Weekly Search Appearances",
                            color_discrete_sequence=["rgba(44, 160, 44, 0.8)"]
                        )
                        
                        # Improve the layout
                        fig.update_layout(
                            xaxis=dict(showgrid=False),
                            yaxis=dict(showgrid=True, gridcolor="rgba(0,0,0,0.1)"),
                            plot_bgcolor="white"
                        )
                        
                        st.plotly_chart(fig, use_container_width=True)
                        
                        # Weekly appearances statistics
                        weekly_search = weekly_data['Search Appearance']
                        st.markdown(f"""
                        ### Weekly Search Statistics
                        - **Average weekly appearances:** {weekly_search.mean():.2f} appearances/week
                        - **Max weekly appearances:** {weekly_search.max():.0f} appearances
                        - **Min weekly appearances:** {weekly_search.min():.0f} appearances
                        - **Median weekly appearances:** {weekly_search.median():.1f} appearances
                        """)
                    
                    with col2:
                        # Create monthly appearances summary
                        st.subheader("Monthly Search Appearances")
                        
                        # Resample by month
                        monthly_data = filtered_df.set_index('Date')[['Search Appearance']].resample('M').sum()
                        
                        # Create monthly appearances bar chart
                        fig = px.bar(
                            monthly_data.reset_index(), 
                            x="Date", 
                            y="Search Appearance",
                            labels={"Search Appearance": "Appearances", "Date": "Month"},
                            title="Monthly Search Appearances",
                            color_discrete_sequence=["rgba(140, 86, 75, 0.8)"]
                        )
                        
                        # Improve the layout
                        fig.update_layout(
                            xaxis=dict(
                                showgrid=False,
                                tickformat="%b %Y"  # Format as "Jan 2025" etc.
                            ),
                            yaxis=dict(showgrid=True, gridcolor="rgba(0,0,0,0.1)"),
                            plot_bgcolor="white"
                        )
                        
                        st.plotly_chart(fig, use_container_width=True)
                        
                        # Monthly appearances statistics
                        monthly_search = monthly_data['Search Appearance']
                        st.markdown(f"""
                        ### Monthly Search Statistics
                        - **Average monthly appearances:** {monthly_search.mean():.2f} appearances/month
                        - **Max monthly appearances:** {monthly_search.max():.0f} appearances
                        - **Min monthly appearances:** {monthly_search.min():.0f} appearances
                        - **Median monthly appearances:** {monthly_search.median():.1f} appearances
                        """)
                    
                    # Comparison with profile views
                    st.subheader("Search Appearances vs. Profile Views")
                    
                    # Compare search appearances and profile views
                    fig = px.line(
                        filtered_df, 
                        x="Date", 
                        y=["Search Appearance", "Views"],
                        title="Search Appearances vs. Profile Views Over Time",
                        labels={"value": "Count", "Date": "", "variable": "Metric"},
                        color_discrete_map={
                            "Search Appearance": "rgba(44, 160, 44, 0.8)", 
                            "Views": "rgba(214, 39, 40, 0.8)"
                        }
                    )
                    
                    # Improve the layout
                    fig.update_layout(
                        hovermode="x unified",
                        xaxis=dict(showgrid=False),
                        yaxis=dict(showgrid=True, gridcolor="rgba(0,0,0,0.1)"),
                        plot_bgcolor="white",
                        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
                    )
                    
                    st.plotly_chart(fig, use_container_width=True)
                    
                    # Search effectiveness metrics
                    st.subheader("Search Effectiveness Metrics")
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        # Create search to view ratio chart
                        search_view_ratio = filtered_df['Search Appearance'] / filtered_df['Views'].clip(lower=1)
                        ratio_df = pd.DataFrame({
                            'Date': filtered_df['Date'],
                            'Search to View Ratio': search_view_ratio
                        })
                        
                        fig = px.line(
                            ratio_df, 
                            x="Date", 
                            y="Search to View Ratio",
                            title="Search to View Ratio Over Time",
                            labels={"Search to View Ratio": "Ratio", "Date": ""},
                            color_discrete_sequence=["rgba(227, 119, 194, 0.8)"]
                        )
                        
                        # Add trendline
                        fig.add_trace(
                            go.Scatter(
                                x=ratio_df["Date"],
                                y=ratio_df["Search to View Ratio"].rolling(window=7, min_periods=1).mean(),
                                mode="lines",
                                name="7-Day Moving Average",
                                line=dict(color="rgba(148, 103, 189, 0.8)", width=2, dash="dash")
                            )
                        )
                        
                        # Improve the layout
                        fig.update_layout(
                            hovermode="x unified",
                            xaxis=dict(showgrid=False),
                            yaxis=dict(showgrid=True, gridcolor="rgba(0,0,0,0.1)"),
                            plot_bgcolor="white",
                            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
                        )
                        
                        st.plotly_chart(fig, use_container_width=True)
                    
                    with col2:
                        st.markdown(f"""
                        ### Search and View Metrics
                        - **Average daily search appearances:** {stats['avg_search']:.1f} appearances/day
                        - **Search to view conversion rate:** {(filtered_df['Views'].sum() / filtered_df['Search Appearance'].sum() * 100):.1f}%
                        - **Average search to view ratio:** {search_view_ratio.mean():.2f}
                        - **Total search appearances:** {filtered_df['Search Appearance'].sum()}
                        - **Days with high search appearance (>10):** {(filtered_df['Search Appearance'] > 10).sum()} days
                        - **Days with zero search appearance:** {(filtered_df['Search Appearance'] == 0).sum()} days
                        """)
                        
                        # Add comparison with industry averages (fictional data, could be replaced with real data)
                        st.markdown("""
                        ### Search Appearances Tips
                        - **Optimize your profile headline** with relevant keywords
                        - **Use industry-specific keywords** in your profile
                        - **Update your profile regularly** to boost LinkedIn algorithm visibility
                        - **Engage with content** in your industry to increase visibility
                        - **Publish relevant content** to establish expertise
                        """)
                        
                    # Add period comparisons, conclusions and recommendations
                    st.subheader("Search Appearances Insights & Recommendations")
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        # Calculate changes for different periods
                        week_change_pct = stats.get('search appearance_week_pct_change', 0)
                        month_change_pct = stats.get('search appearance_month_pct_change', 0)
                        week_change = stats.get('search appearance_week_change', 0)
                        month_change = stats.get('search appearance_month_change', 0)
                        
                        # Colors for trends
                        week_color = "green" if week_change > 0 else "red" if week_change < 0 else "gray"
                        month_color = "green" if month_change > 0 else "red" if month_change < 0 else "gray"
                        
                        st.markdown(f"""
                        ### Search Visibility Analysis
                        
                        #### Weekly Comparison
                        <span style="color:{week_color}">**{week_change:+.0f} search appearances**</span> in the last week 
                        ({week_change_pct:.1f}% change)
                        
                        #### Monthly Comparison
                        <span style="color:{month_color}">**{month_change:+.0f} search appearances**</span> in the last month 
                        ({month_change_pct:.1f}% change)
                        
                        #### Key Insights
                        - Your profile appears in **{stats['avg_search']:.1f} searches per day** on average
                        - Your search-to-view conversion rate is **{(filtered_df['Views'].sum() / filtered_df['Search Appearance'].sum() * 100):.1f}%**
                        - Your search appearances are **{week_change_pct:.1f}% {week_change >= 0 and 'up' or 'down'}** compared to last week
                        """, unsafe_allow_html=True)
                    
                    with col2:
                        # Generate recommendations based on search patterns
                        search_level = "high" if stats['avg_search'] > 15 else "moderate" if stats['avg_search'] > 5 else "low"
                        search_trend = "improving" if week_change > 0 else "declining" if week_change < 0 else "stable"
                        
                        st.markdown(f"""
                        ### Recommendations
                        
                        #### Searchability Optimization
                        - **Keyword Strategy**: {'Maintain your current keywords' if search_level == 'high' else 'Add more industry-specific keywords to your profile'}
                        - **Content Visibility**: {'Your content strategy is working well' if search_level != 'low' else 'Create more searchable content'}
                        - **Skills Section**: {'Keep your skills section updated' if search_level != 'low' else 'Add more relevant skills to your profile'}
                        
                        #### Action Items
                        1. {'Analyze which keywords are driving search appearances' if search_level == 'high' else 'Research industry keywords to add to your profile'}
                        2. {'Maintain content posting schedule' if search_trend == 'improving' else 'Increase content posting frequency'}
                        3. {'Focus on engagement to boost algorithmic visibility' if search_trend != 'improving' else 'Continue your current engagement strategy'}
                        4. {'Optimize your job title and headline' if search_level == 'low' else 'Add more detail to your experience descriptions'}
                        """)
                
                elif category == "SSI Score":
                    # SSI specific metrics
                    st.subheader("Linalysis Social Selling Index (SSI) Analysis")
                    
                    # Check if all SSI columns exist
                    has_ssi_components = all(col in filtered_df.columns for col in ['SSI', 'SSI Industry', 'SSI Network'])
                    
                    # Top metrics row
                    if has_ssi_components:
                        col1, col2, col3, col4 = st.columns(4)
                        
                        with col1:
                            st.metric(
                                label="Current SSI Score", 
                                value=f"{stats['latest_ssi']}/100",
                                delta=ssi_change
                            )
                        
                        with col2:
                            st.metric(
                                label="Industry Ranking", 
                                value=f"{filtered_df['SSI Industry'].iloc[-1]}"
                            )
                        
                        with col3:
                            st.metric(
                                label="Network Ranking", 
                                value=f"{filtered_df['SSI Network'].iloc[-1]}"
                            )
                        
                        with col4:
                            # Calculate percentile based on industry ranking
                            industry_rank = filtered_df['SSI Industry'].iloc[-1]
                            try:
                                # Try to convert to float if it's a percentage string
                                industry_percentile = float(industry_rank.strip('%'))
                            except (ValueError, AttributeError):
                                # If it fails, use a default value
                                industry_percentile = 50
                                
                            st.metric(
                                label="Industry Percentile", 
                                value=f"{industry_percentile}%"
                            )
                    else:
                        # Simplified metrics if components aren't available
                        col1, col2 = st.columns(2)
                        
                        with col1:
                            st.metric(
                                label="Current SSI Score", 
                                value=f"{stats['latest_ssi']}/100",
                                delta=ssi_change
                            )
                        
                        with col2:
                            st.metric(
                                label="Average SSI Score", 
                                value=f"{stats['avg_ssi']:.1f}/100"
                            )
                    
                    # Main SSI chart
                    st.subheader("SSI Score Evolution")
                    st.plotly_chart(create_ssi_chart(filtered_df), use_container_width=True)
                    
                    # Weekly and monthly SSI in two columns
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        # Create weekly SSI summary
                        st.subheader("Weekly SSI Average")
                        
                        # Resample by week
                        weekly_data = filtered_df.set_index('Date')[['SSI']].resample('W').mean()
                        
                        # Create weekly SSI line chart
                        fig = px.line(
                            weekly_data.reset_index(), 
                            x="Date", 
                            y="SSI",
                            labels={"SSI": "Average SSI Score", "Date": "Week"},
                            title="Weekly Average SSI Score",
                            color_discrete_sequence=["rgba(31, 119, 180, 0.8)"],
                            markers=True
                        )
                        
                        # Improve the layout
                        fig.update_layout(
                            xaxis=dict(showgrid=False),
                            yaxis=dict(
                                showgrid=True, 
                                gridcolor="rgba(0,0,0,0.1)",
                                range=[0, 100]  # Fix y-axis range for SSI
                            ),
                            plot_bgcolor="white"
                        )
                        
                        st.plotly_chart(fig, use_container_width=True)
                        
                        # Weekly SSI statistics
                        weekly_ssi = weekly_data['SSI']
                        st.markdown(f"""
                        ### Weekly SSI Statistics
                        - **Average weekly SSI:** {weekly_ssi.mean():.2f}/100
                        - **Max weekly SSI:** {weekly_ssi.max():.1f}/100
                        - **Min weekly SSI:** {weekly_ssi.min():.1f}/100
                        - **Median weekly SSI:** {weekly_ssi.median():.1f}/100
                        """)
                    
                    with col2:
                        # Create monthly SSI summary
                        st.subheader("Monthly SSI Average")
                        
                        # Resample by month
                        monthly_data = filtered_df.set_index('Date')[['SSI']].resample('M').mean()
                        
                        # Create monthly SSI line chart
                        fig = px.line(
                            monthly_data.reset_index(), 
                            x="Date", 
                            y="SSI",
                            labels={"SSI": "Average SSI Score", "Date": "Month"},
                            title="Monthly Average SSI Score",
                            color_discrete_sequence=["rgba(255, 127, 14, 0.8)"],
                            markers=True
                        )
                        
                        # Improve the layout
                        fig.update_layout(
                            xaxis=dict(
                                showgrid=False,
                                tickformat="%b %Y"  # Format as "Jan 2025" etc.
                            ),
                            yaxis=dict(
                                showgrid=True, 
                                gridcolor="rgba(0,0,0,0.1)",
                                range=[0, 100]  # Fix y-axis range for SSI
                            ),
                            plot_bgcolor="white"
                        )
                        
                        st.plotly_chart(fig, use_container_width=True)
                        
                        # Monthly SSI statistics
                        monthly_ssi = monthly_data['SSI']
                        st.markdown(f"""
                        ### Monthly SSI Statistics
                        - **Average monthly SSI:** {monthly_ssi.mean():.2f}/100
                        - **Max monthly SSI:** {monthly_ssi.max():.1f}/100
                        - **Min monthly SSI:** {monthly_ssi.min():.1f}/100
                        - **Median monthly SSI:** {monthly_ssi.median():.1f}/100
                        """)
                    
                    # SSI Components and Explanation
                    st.subheader("Understanding Your SSI Score")
                    
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        st.markdown(f"""
                        ### Your SSI Performance
                        - **Current SSI Score:** {stats['latest_ssi']}/100
                        - **Min SSI:** {filtered_df['SSI'].min():.1f}/100
                        - **Max SSI:** {stats['max_ssi']}/100
                        - **Average SSI:** {stats['avg_ssi']:.1f}/100
                        
                        ### SSI Industry Rankings
                        - **Your Industry Ranking:** {filtered_df['SSI Industry'].iloc[-1] if 'SSI Industry' in filtered_df.columns else 'N/A'}
                        - **Your Network Ranking:** {filtered_df['SSI Network'].iloc[-1] if 'SSI Network' in filtered_df.columns else 'N/A'}
                        """)
                    
                    with col2:
                        st.markdown("""
                        ### What is SSI?
                        The **Social Selling Index (SSI)** measures how effective you are at establishing your professional brand, finding the right people, engaging with insights, and building relationships on LinkedIn.
                        
                        ### The Four Pillars of SSI:
                        1. **Establish your professional brand** - Complete your profile with the customer in mind
                        2. **Find the right people** - Identify better prospects in less time using efficient search and research tools
                        3. **Engage with insights** - Discover and share conversation-worthy content
                        4. **Build relationships** - Strengthen your network by connecting and establishing trust with decision makers
                        """)
                    
                    # SSI Improvement Tips
                    st.subheader("SSI Improvement Tips")
                    
                    col1, col2, col3 = st.columns(3)
                    
                    with col1:
                        st.markdown("""
                        ### Professional Brand
                        - Complete all sections of your profile
                        - Add a professional photo and cover image
                        - Request recommendations from colleagues
                        - Share relevant work samples and projects
                        - Update your headline with keywords
                        """)
                    
                    with col2:
                        st.markdown("""
                        ### Finding & Engaging
                        - Use advanced search to find prospects
                        - Follow relevant industry leaders
                        - Comment on and share relevant posts
                        - Publish articles on industry topics
                        - Join and participate in relevant groups
                        """)
                    
                    with col3:
                        st.markdown("""
                        ### Relationship Building
                        - Personalize connection requests
                        - Follow up with new connections
                        - Share valuable content regularly
                        - Engage with your network's updates
                        - Introduce connections to each other
                        """)
                        
                    # Add period comparisons, conclusions and recommendations
                    st.subheader("SSI Score Insights & Recommendations")
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        # Calculate changes for different periods
                        week_change_pct = stats.get('ssi_week_pct_change', 0)
                        month_change_pct = stats.get('ssi_month_pct_change', 0)
                        week_change = stats.get('ssi_week_change', 0)
                        month_change = stats.get('ssi_month_change', 0)
                        
                        # Colors for trends
                        week_color = "green" if week_change > 0 else "red" if week_change < 0 else "gray"
                        month_color = "green" if month_change > 0 else "red" if month_change < 0 else "gray"
                        
                        st.markdown(f"""
                        ### SSI Performance Analysis
                        
                        #### Weekly Comparison
                        <span style="color:{week_color}">**{week_change:+.1f} points**</span> in the last week 
                        ({week_change_pct:.1f}% change)
                        
                        #### Monthly Comparison
                        <span style="color:{month_color}">**{month_change:+.1f} points**</span> in the last month 
                        ({month_change_pct:.1f}% change)
                        
                        #### Key Insights
                        - Your current SSI score is **{stats['latest_ssi']}/100**
                        - Your score is **{stats['latest_ssi'] - 45 if stats['latest_ssi'] > 45 else 45 - stats['latest_ssi']} points {stats['latest_ssi'] > 45 and 'above' or 'below'}** the average SSI score of 45
                        - Your maximum SSI score reached was **{stats['max_ssi']}/100**
                        - Your SSI trend is **{week_change_pct:.1f}% {week_change >= 0 and 'up' or 'down'}** compared to last week
                        """, unsafe_allow_html=True)
                    
                    with col2:
                        # Generate recommendations based on SSI patterns
                        ssi_level = "high" if stats['latest_ssi'] > 60 else "moderate" if stats['latest_ssi'] > 40 else "low"
                        ssi_trend = "improving" if week_change > 0 else "declining" if week_change < 0 else "stable"
                        
                        st.markdown(f"""
                        ### Recommendations
                        
                        #### SSI Improvement Strategy
                        - **Professional Brand**: {'Continue maintaining your strong brand' if ssi_level == 'high' else 'Enhance your profile completeness'}
                        - **Finding Right People**: {'Maintain your network growth' if ssi_level != 'low' else 'Expand your network with targeted connections'}
                        - **Engagement Strategy**: {'Continue your content engagement' if ssi_trend == 'improving' else 'Increase your content interactions'}
                        
                        #### Action Items
                        1. {'Share thought leadership content weekly' if ssi_level == 'high' else 'Complete all sections of your profile'}
                        2. {'Maintain your engagement consistency' if ssi_trend != 'declining' else 'Comment on industry posts daily'}
                        3. {'Focus on strategic connections' if ssi_level == 'high' else 'Connect with industry leaders in your field'}
                        4. {'Continue relationship building with current connections' if ssi_level != 'low' else 'Request recommendations from colleagues'}
                        """)
                
                elif category == "Invitations":
                    # Invitations specific metrics
                    if 'Invitations' in filtered_df.columns:
                        st.subheader("Linalysis Invitations Analysis")
                        
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
                                title="Linalysis Pending Invitations Over Time",
                                labels={"Invitations": "Pending Invitations", "Date": ""},
                                markers=True,
                                color_discrete_sequence=["rgba(255, 128, 0, 0.9)"]  # Orange main color
                            )
                            
                            # Add trendline
                            fig.add_trace(
                                go.Scatter(
                                    x=filtered_df["Date"],
                                    y=filtered_df["Invitations"].rolling(window=7, min_periods=1).mean(),
                                    mode="lines",
                                    name="7-Day Moving Average",
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
                                line=dict(color="rgba(255, 128, 0, 0.9)", width=2)  # Orange main color
                            )
                        )
                        
                        # Add Connections
                        fig.add_trace(
                            go.Scatter(
                                x=filtered_df["Date"],
                                y=conn_norm,
                                mode="lines+markers",
                                name="Connections",
                                line=dict(color="rgba(255, 84, 0, 0.6)", width=2)  # Darker orange
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
                        
                        # Add period comparisons, conclusions and recommendations
                        st.subheader("Invitations Insights & Recommendations")
                        col1, col2 = st.columns(2)
                        
                        with col1:
                            # Calculate changes for different periods
                            week_change_pct = stats.get('invitations_week_pct_change', 0)
                            month_change_pct = stats.get('invitations_month_pct_change', 0)
                            week_change = stats.get('invitations_week_change', 0)
                            month_change = stats.get('invitations_month_change', 0)
                            
                            # Colors for trends
                            week_color = "green" if week_change > 0 else "red" if week_change < 0 else "gray"
                            month_color = "green" if month_change > 0 else "red" if month_change < 0 else "gray"
                            
                            st.markdown(f"""
                            ### Invitation Analysis
                            
                            #### Weekly Comparison
                            <span style="color:{week_color}">**{week_change:+.0f} invitations**</span> in the last week 
                            ({week_change_pct:.1f}% change)
                            
                            #### Monthly Comparison
                            <span style="color:{month_color}">**{month_change:+.0f} invitations**</span> in the last month 
                            ({month_change_pct:.1f}% change)
                            
                            #### Key Insights
                            - You currently have **{invitations_value} pending invitations**
                            - Your invitation count is **{week_change_pct:.1f}% {week_change >= 0 and 'up' or 'down'}** compared to last week
                            - Invitation to connection ratio: **{invitation_connection_ratio:.2f}** ({invitation_connection_ratio > 2 and 'high' or 'balanced'})
                            """, unsafe_allow_html=True)
                        
                        with col2:
                            # Generate recommendations based on invitation patterns
                            invitation_level = "high" if invitations_value > 15 else "moderate" if invitations_value > 5 else "low"
                            invitation_trend = "increasing" if week_change > 0 else "decreasing" if week_change < 0 else "stable"
                            
                            st.markdown(f"""
                            ### Recommendations
                            
                            #### Invitation Management
                            - **Acceptance Strategy**: {'Prioritize reviewing pending invitations' if invitation_level == 'high' else 'Maintain your current acceptance pace'}
                            - **Network Quality**: {'Focus on quality over quantity' if invitation_level == 'high' else 'Continue building your network'}
                            - **Connection Balance**: {'Review older invitations first' if invitation_trend == 'increasing' else 'Maintain your current invitation management'}
                            
                            #### Action Items
                            1. {'Schedule time to review pending invitations' if invitation_level == 'high' else 'Continue your regular invitation reviews'}
                            2. {'Prioritize invitations from your industry' if invitation_level != 'low' else 'Consider connecting with more professionals'}
                            3. {'Check for personalized invitation messages' if invitation_level == 'high' else 'Send personalized invitations to grow your network'}
                            4. {'Be more selective with accepting invitations' if invitation_trend == 'increasing' else 'Balance your network growth by accepting relevant invitations'}
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

#!/bin/bash

# Setup script for Streamlit deployment
mkdir -p ~/.streamlit/

# Create Streamlit config
cat > ~/.streamlit/config.toml <<EOF
[server]
headless = true
port = \$PORT
enableCORS = false
enableXsrfProtection = false

[browser]
gatherUsageStats = false
serverAddress = "linalysis.us"
serverPort = \$PORT

[theme]
primaryColor = "#FE1B04"
backgroundColor = "#FAFAFA"
secondaryBackgroundColor = "#FFFFFF"
textColor = "#262730"
font = "sans serif"
EOF

echo "Streamlit configuration created successfully"

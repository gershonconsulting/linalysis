# Linalysis - Genspark Hosted Deploy Configuration

## 🎯 Deployment to linalysis.us

This project is configured for deployment to **linalysis.us** using **Genspark's Hosted Deploy** feature.

---

## 📦 Deployment Files

The following files have been configured for Genspark Hosted Deploy:

### Required Files

1. **requirements.txt** - Python dependencies
   ```
   numpy==1.26.4
   pandas==2.2.3
   plotly==6.0.1
   streamlit==1.54.0
   ```

2. **Procfile** - Application startup command
   ```
   web: streamlit run app.py --server.port=$PORT --server.address=0.0.0.0 --server.headless=true
   ```

3. **runtime.txt** - Python version specification
   ```
   python-3.11.9
   ```

4. **.python-version** - Python version for build
   ```
   3.11.9
   ```

5. **setup.sh** - Pre-deployment configuration script (optional)

6. **.streamlit/config.toml** - Streamlit configuration
   - Headless mode enabled
   - Port configuration
   - CORS disabled for production
   - Custom theme with orange branding (#FE1B04)

---

## 🚀 Deployment Steps

### Step 1: Commit All Changes

All deployment files are ready and will be committed to GitHub:

```bash
git add .
git commit -m "Configure for Genspark Hosted Deploy to linalysis.us"
git push origin main
```

### Step 2: Deploy via Genspark

1. **Go to Genspark Deploy Tab**
   - Navigate to your Genspark workspace
   - Click on the "Deploy" or "Hosted Deploy" section

2. **Select Repository**
   - Choose: `gershonconsulting/linalysis`
   - Branch: `main`

3. **Configure Domain**
   - Custom domain: `linalysis.us`
   - The system will automatically detect Python/Streamlit

4. **Build Settings (Auto-detected)**
   - Build command: `pip install -r requirements.txt`
   - Start command: From Procfile → `streamlit run app.py --server.port=$PORT --server.address=0.0.0.0 --server.headless=true`
   - Python version: `3.11.9` (from runtime.txt)

5. **Environment Variables** (if needed)
   - `PORT` - Automatically set by Genspark
   - Add any LinkedIn OAuth credentials if needed:
     - `LINKEDIN_CLIENT_ID`
     - `LINKEDIN_CLIENT_SECRET`
     - `LINKEDIN_REDIRECT_URI`

6. **Deploy**
   - Click "Deploy" button
   - Wait for build to complete (usually 2-5 minutes)
   - Your app will be live at: **https://linalysis.us**

---

## 🔧 Configuration Details

### Port Configuration
- The application uses `$PORT` environment variable
- Genspark automatically assigns and injects this variable
- Default local port: 8501 (Streamlit default)

### Server Settings
- **Headless mode**: Enabled (no browser auto-open)
- **Address**: 0.0.0.0 (listen on all interfaces)
- **CORS**: Disabled for production
- **XSRF Protection**: Disabled for embedded iframes

### Theme Configuration
- **Primary Color**: #FE1B04 (Orange - brand color)
- **Background**: #FAFAFA (Light gray)
- **Secondary Background**: #FFFFFF (White)
- **Text Color**: #262730 (Dark gray)
- **Font**: Sans serif

---

## 📊 Application Structure

```
linalysis/
├── app.py                          # Main application entry point
├── requirements.txt                # Python dependencies
├── Procfile                        # Deployment startup command
├── runtime.txt                     # Python version
├── .python-version                 # Python version for build
├── setup.sh                        # Optional setup script
├── .streamlit/
│   ├── config.toml                 # Streamlit configuration
│   └── secrets.toml                # Secrets (not in Git)
├── linkedin_data_processor.py      # Data processing
├── campaign_data_processor.py      # Campaign analytics
├── visualization.py                # Charts and graphs
├── campaign_visualization.py       # Campaign charts
├── utils.py                        # Utilities
└── attached_assets/                # Static files
```

---

## 🔐 Environment Variables (Optional)

If you need to enable LinkedIn OAuth:

```bash
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
LINKEDIN_REDIRECT_URI=https://linalysis.us/callback
```

Set these in Genspark's deployment dashboard under "Environment Variables".

---

## ✅ Pre-Deployment Checklist

- [x] requirements.txt created with all dependencies
- [x] Procfile configured with correct startup command
- [x] runtime.txt specifies Python 3.11.9
- [x] .python-version file created
- [x] .streamlit/config.toml configured for production
- [x] .gitignore excludes cache and sensitive files
- [x] All code tested locally
- [x] README.md documentation complete
- [x] GitHub repository up to date

---

## 🧪 Local Testing

Before deploying, you can test locally:

```bash
# Install dependencies
pip install -r requirements.txt

# Run the application
streamlit run app.py --server.port=8501 --server.address=0.0.0.0 --server.headless=true

# Test in browser
open http://localhost:8501
```

---

## 📝 Post-Deployment

After successful deployment:

1. **Verify the URL**: Visit https://linalysis.us
2. **Test functionality**: Upload CSV files and check visualizations
3. **Check logs**: Monitor application logs in Genspark dashboard
4. **Configure DNS**: Ensure linalysis.us points to Genspark servers
5. **Enable SSL**: Genspark should auto-provision SSL certificate

---

## 🔄 Updates and Redeployment

To update the application:

```bash
# Make changes to code
git add .
git commit -m "Update: description of changes"
git push origin main
```

Genspark will automatically detect the push and redeploy (if auto-deploy is enabled), or you can trigger manual deployment from the dashboard.

---

## 🐛 Troubleshooting

### Build Fails
- Check requirements.txt for compatible versions
- Verify Python version matches runtime.txt
- Review build logs in Genspark dashboard

### Application Won't Start
- Check Procfile command syntax
- Verify PORT environment variable is being used
- Review application logs for errors

### Port Binding Issues
- Ensure using `$PORT` environment variable
- Check server.address is set to "0.0.0.0"
- Verify no hardcoded ports in code

### Module Import Errors
- Ensure all dependencies are in requirements.txt
- Check for version compatibility issues
- Verify Python version matches requirements

---

## 📞 Support

For deployment issues:
- Check Genspark documentation
- Review application logs in dashboard
- Contact Genspark support

For application issues:
- Open GitHub issue: https://github.com/gershonconsulting/linalysis/issues
- Check application logs for errors

---

## 🎉 Success Criteria

Your deployment is successful when:

✅ Build completes without errors  
✅ Application starts and listens on assigned port  
✅ https://linalysis.us loads the dashboard  
✅ File upload functionality works  
✅ Charts and visualizations render correctly  
✅ No console errors in browser  
✅ SSL certificate is active  

---

**Ready for deployment to linalysis.us!** 🚀

The code is fully configured and optimized for Genspark Hosted Deploy.

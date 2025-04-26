
import streamlit as st
import requests
from urllib.parse import urlencode

def initialize_linkedin_auth():
    if 'linkedin_token' not in st.session_state:
        st.session_state.linkedin_token = None
        
    if 'user_info' not in st.session_state:
        st.session_state.user_info = None

def get_linkedin_auth_url():
    params = {
        'response_type': 'code',
        'client_id': st.secrets.oauth.linkedin_client_id,
        'redirect_uri': st.secrets.oauth.linkedin_redirect_uri,
        'scope': 'r_liteprofile r_emailaddress w_member_social',
        'state': 'random_state_string'
    }
    return f"https://www.linkedin.com/oauth/v2/authorization?{urlencode(params)}"

def handle_linkedin_callback(code):
    token_url = 'https://www.linkedin.com/oauth/v2/accessToken'
    token_params = {
        'grant_type': 'authorization_code',
        'code': code,
        'client_id': st.secrets.oauth.linkedin_client_id,
        'client_secret': st.secrets.oauth.linkedin_client_secret,
        'redirect_uri': st.secrets.oauth.linkedin_redirect_uri
    }
    
    response = requests.post(token_url, data=token_params)
    if response.ok:
        token_data = response.json()
        st.session_state.linkedin_token = token_data['access_token']
        fetch_user_info()
        return True
    return False

def fetch_user_info():
    if not st.session_state.linkedin_token:
        return None
        
    headers = {
        'Authorization': f'Bearer {st.session_state.linkedin_token}',
        'Accept': 'application/json',
    }
    
    response = requests.get('https://api.linkedin.com/v2/me', headers=headers)
    if response.ok:
        st.session_state.user_info = response.json()
        return st.session_state.user_info
    return None

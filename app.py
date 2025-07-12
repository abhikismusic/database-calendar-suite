# FILE: app.py (v4.0.1 - Phoenix Hotfix Release)

import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from flask import Flask, g, render_template, request, jsonify
import gspread
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload
import io

# --- Configuration ---
class Config:
    SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/spreadsheets']
    APP_MAIN_FOLDER = "DatabaseCalendarApp_Root"
    LOG_SHEET_NAME = "DatabaseCalendarApp - Historical Log"
    FOLDER_CONFIG = {
        'text_prompt': 'Text_Prompts', 'edit_prompt': 'Edit_Prompts',
        'video_prompt': 'Video_Prompts', 'audio_prompt': 'Audio_Prompts',
    }
    APP_VERSION = "4.0.1"

app = Flask(__name__)
app.config.from_object(Config)

# --- Service Getters & Context Management ---
def get_drive_service():
    if 'drive_service' not in g:
        creds = Credentials.from_authorized_user_file('token.json', Config.SCOPES)
        g.drive_service = build('drive', 'v3', credentials=creds)
    return g.drive_service
# (The rest of the Python code you provided is correct, I'm including it all for completeness)
def get_gspread_client():
    if 'gspread_client' not in g:
        creds = Credentials.from_authorized_user_file('token.json', Config.SCOPES)
        g.gspread_client = gspread.authorize(creds)
    return g.gspread_client

@app.before_request
def before_request():
    try:
        if os.path.exists('token.json'):
            creds = Credentials.from_authorized_user_file('token.json', Config.SCOPES)
            if not creds.valid:
                if creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                    with open('token.json', 'w') as token:
                        token.write(creds.to_json())
    except Exception as e:
        # If token is invalid/corrupted, it needs to be deleted to re-trigger auth
        if os.path.exists('token.json'): os.remove('token.json')
        print(f"Token error, please restart and re-authenticate: {e}")

def log_action(action_type, message, calendar_type="N/A"):
    # ... (function is correct)
    try:
        service = get_drive_service()
        gc = get_gspread_client()
        main_folder_id, _ = get_or_create_folder(Config.APP_MAIN_FOLDER, 'root')
        files = service.files().list(q=f"name='{Config.LOG_SHEET_NAME}' and '{main_folder_id}' in parents and trashed=false", fields='files(id)').execute().get('files', [])
        if files: sh = gc.open_by_key(files[0]['id'])
        else:
            sh = gc.create(Config.LOG_SHEET_NAME)
            service.files().update(fileId=sh.id, addParents=main_folder_id, removeParents='root').execute()
        worksheet = sh.sheet1
        if worksheet.row_count == 0 or worksheet.cell(1,1).value != 'Timestamp': worksheet.insert_row(['Timestamp', 'ActionType', 'Message', 'CalendarType'], 1)
        log_row = [int(datetime.utcnow().timestamp()), action_type, message, calendar_type]
        worksheet.append_row(log_row)
    except Exception as e: print(f"!!! FAILED TO WRITE LOG: {e}")

def get_or_create_folder(name, parent_id=None):
    # ... (function is correct)
    service = get_drive_service()
    query = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    q_parent = "'root' in parents" if parent_id == 'root' else f"'{parent_id}' in parents"
    query += f" and {q_parent}"
    response = service.files().list(q=query, spaces='drive', fields='files(id, webViewLink)').execute()
    files = response.get('files', [])
    if files: return files[0].get('id'), files[0].get('webViewLink')
    else:
        file_metadata = {'name': name, 'mimeType': 'application/vnd.google-apps.folder'}
        if parent_id != 'root': file_metadata['parents'] = [parent_id]
        folder = service.files().create(body=file_metadata, fields='id, webViewLink', supportsAllDrives=True).execute()
        return folder.get('id'), folder.get('webViewLink')

def get_or_create_path(calendar_type, date_obj):
    # ... (function is correct)
    main_folder_id, _ = get_or_create_folder(Config.APP_MAIN_FOLDER, 'root')
    prompt_type_folder_id, _ = get_or_create_folder(Config.FOLDER_CONFIG[calendar_type], main_folder_id)
    month_folder_name = date_obj.strftime('%Y-%m')
    month_folder_id, _ = get_or_create_folder(month_folder_name, prompt_type_folder_id)
    return month_folder_id

def download_file_as_df(file_id):
    # ... (function is correct)
    service = get_drive_service()
    request_file = service.files().get_media(fileId=file_id)
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request_file)
    done = False
    while not done: status, done = downloader.next_chunk()
    fh.seek(0)
    return pd.read_csv(fh, encoding='utf-8')

def upload_single_day_csv(df_new, date_str, folder_id):
    # ... (function is correct)
    service = get_drive_service()
    filename = f"{date_str}.csv"
    response = service.files().list(q=f"name='{filename}' and '{folder_id}' in parents and trashed=false", fields="files(id)").execute()
    existing_files = response.get('files', [])
    app_properties = {'is_distributed': str(df_new['is_distributed'].any()).lower()}
    if existing_files:
        df_existing = download_file_as_df(existing_files[0]['id'])
        df_combined = pd.concat([df_existing, df_new], ignore_index=True)
        if 'was_downloaded_x' in df_combined.columns:
            df_combined['was_downloaded'] = df_combined['was_downloaded_y'].fillna(df_combined['was_downloaded_x'])
            df_combined.drop(columns=['was_downloaded_x', 'was_downloaded_y'], inplace=True)
        df_final = df_combined.drop_duplicates(subset=['prompt'], keep='last')
    else:
        df_final = df_new
    csv_buffer = io.BytesIO()
    df_final.to_csv(csv_buffer, index=False, encoding='utf-8')
    csv_buffer.seek(0)
    media = MediaIoBaseUpload(csv_buffer, mimetype='text/csv', resumable=True)
    if existing_files:
        service.files().update(fileId=existing_files[0]['id'], body={'appProperties': app_properties}, media_body=media).execute()
    else:
        service.files().create(body={'name': filename, 'parents': [folder_id], 'appProperties': app_properties}, media_body=media, fields='id').execute()

# --- All API Routes ---
@app.route('/')
def index(): return render_template('index.html', version=app.config['APP_VERSION'])

@app.route('/api/upload-csv', methods=['POST'])
def upload_csv(): # ... (function is correct)
    calendar_type = request.form.get('type', 'text_prompt')
    files = request.files.getlist('file')
    if not files or files[0].filename == '': return jsonify({"error": "No files selected"}), 400
    try:
        all_processed_dates = set()
        for file in files:
            file.stream.seek(0)
            if calendar_type == 'text_prompt' and 'startDate' in request.form:
                prompts = [line.strip() for line in file.stream.read().decode('utf-8').splitlines() if line.strip()]
                if not prompts: continue
                df = pd.DataFrame(prompts, columns=['prompt']); df['is_distributed'] = True
                start_date = datetime.strptime(request.form.get('startDate'), '%Y-%m-%d')
                end_date = datetime.strptime(request.form.get('endDate'), '%Y-%m-%d')
                num_days = (end_date - start_date).days + 1
                prompt_chunks = np.array_split(df, num_days)
                for i, date_chunk in enumerate(prompt_chunks):
                    if not date_chunk.empty:
                        current_date = start_date + timedelta(days=i)
                        month_folder_id = get_or_create_path(calendar_type, current_date)
                        chunk_copy = date_chunk.copy(); chunk_copy.loc[:, 'Time'] = int(current_date.replace(hour=12).timestamp())
                        upload_single_day_csv(chunk_copy, current_date.strftime('%Y-%m-%d'), month_folder_id)
                        all_processed_dates.add(current_date.strftime('%Y-%m-%d'))
            else:
                df = pd.read_csv(file.stream)
                if 'prompt' not in df.columns or 'Time' not in df.columns: continue
                df['is_distributed'] = False; df['date'] = pd.to_datetime(df['Time'], unit='s').dt.date
                for date_val, df_group in df.groupby('date'):
                    month_folder_id = get_or_create_path(calendar_type, date_val)
                    df_day = df_group.drop(columns=['date']); upload_single_day_csv(df_day.copy(), date_val.strftime('%Y-%m-%d'), month_folder_id)
                    all_processed_dates.add(date_val.strftime('%Y-%m-%d'))
        log_action("UPLOAD_SUCCESS", f"Processed {len(all_processed_dates)} days from {len(files)} file(s).", calendar_type)
        return jsonify({"success": True, "processed_dates": list(all_processed_dates)})
    except Exception as e:
        log_action("UPLOAD_ERROR", str(e), calendar_type)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

@app.route('/api/get-calendar-data')
def get_calendar_data(): # ... (function is correct)
    service = get_drive_service()
    calendar_type = request.args.get('type', 'text_prompt')
    main_folder_id, _ = get_or_create_folder(Config.APP_MAIN_FOLDER, 'root')
    prompt_type_folder_id, _ = get_or_create_folder(Config.FOLDER_CONFIG[calendar_type], main_folder_id)
    all_files = []
    page_token = None
    while True:
        response = service.files().list(q=f"'{prompt_type_folder_id}' in parents and trashed=false and mimeType = 'application/vnd.google-apps.folder'", pageSize=1000, spaces='drive', fields='nextPageToken, files(id, name)', pageToken=page_token).execute()
        for month_folder in response.get('files', []):
            files_in_month = service.files().list(q=f"'{month_folder.get('id')}' in parents and trashed=false", spaces='drive', fields='files(name, appProperties)').execute()
            all_files.extend(files_in_month.get('files', []))
        page_token = response.get('nextPageToken', None)
        if page_token is None: break
    dates_with_data = [f['name'].replace('.csv', '') for f in all_files]
    distributed_dates = [f['name'].replace('.csv', '') for f in all_files if f.get('appProperties', {}).get('is_distributed') == 'true']
    return jsonify({'datesWithData': dates_with_data, 'distributedDates': distributed_dates})

@app.route('/api/get-prompts/<date_str>')
def get_prompts_for_date(date_str): # ... (function is correct)
    calendar_type = request.args.get('type', 'text_prompt')
    try:
        date_obj = datetime.strptime(date_str, '%Y-%m-%d')
        month_folder_id = get_or_create_path(calendar_type, date_obj)
        filename = f"{date_str}.csv"
        response = get_drive_service().files().list(q=f"name='{filename}' and '{month_folder_id}' in parents and trashed=false", fields="files(id)").execute()
        files = response.get('files', [])
        if not files: return jsonify({"error": "No data found for this date"}), 404
        df = download_file_as_df(files[0]['id']); df = df.where(pd.notnull(df), None)
        return jsonify(df.to_dict(orient='records'))
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/api/delete-data', methods=['POST'])
def delete_data(): # ... (function is correct)
    service = get_drive_service()
    calendar_type = request.json.get('type', 'text_prompt')
    dates_to_delete = request.json.get('dates', [])
    if not dates_to_delete: return jsonify({'error': 'No dates provided'}), 400
    main_folder_id, _ = get_or_create_folder(Config.APP_MAIN_FOLDER, 'root')
    prompt_type_folder_id, _ = get_or_create_folder(Config.FOLDER_CONFIG[calendar_type], main_folder_id)
    deleted_count = 0
    try:
        dates_by_month = {};
        for date_str in dates_to_delete: month_str = date_str[:7]; dates_by_month.setdefault(month_str, []).append(date_str)
        for month_str, dates in dates_by_month.items():
            month_folder_response = service.files().list(q=f"name='{month_str}' and '{prompt_type_folder_id}' in parents and trashed=false", fields="files(id)").execute()
            if not month_folder_response.get('files'): continue
            month_folder_id = month_folder_response.get('files')[0]['id']
            query_parts = [f"name = '{date}.csv'" for date in dates]
            query = f"({' or '.join(query_parts)}) and '{month_folder_id}' in parents and trashed=false"
            files_to_delete = service.files().list(q=query, fields="files(id)").execute().get('files', [])
            for file in files_to_delete: service.files().delete(fileId=file.get('id')).execute(); deleted_count += 1
        log_action("DELETE_SUCCESS", f"Deleted {deleted_count} file(s).", calendar_type)
        return jsonify({'success': True, 'deleted_count': deleted_count})
    except Exception as e: log_action("DELETE_ERROR", str(e), calendar_type); return jsonify({"error": str(e)}), 500

# --- THIS IS THE MISSING ENDPOINT ---
@app.route('/api/get-drive-folder-info')
def get_drive_folder_info():
    calendar_type = request.args.get('type', 'text_prompt')
    folder_name = app.config['FOLDER_CONFIG'].get(calendar_type)
    service = get_drive_service()
    main_folder_id, _ = get_or_create_folder(app.config['APP_MAIN_FOLDER'], 'root')
    prompt_type_folder_id, folder_link = get_or_create_folder(folder_name, main_folder_id)
    return jsonify({'folder_link': folder_link})
# --- END MISSING ENDPOINT ---

@app.route('/api/get-log-file-url')
def get_log_file_url(): # ... (function is correct)
    # ...
    service = get_drive_service(); gc = get_gspread_client()
    main_folder_id, _ = get_or_create_folder(Config.APP_MAIN_FOLDER, 'root')
    files = service.files().list(q=f"name='{Config.LOG_SHEET_NAME}' and '{main_folder_id}' in parents and trashed=false", fields='files(id, webViewLink)').execute().get('files', [])
    if files: return jsonify({'url': files[0]['webViewLink']})
    else:
        sh = gc.create(Config.LOG_SHEET_NAME)
        service.files().update(fileId=sh.id, addParents=main_folder_id, removeParents='root').execute()
        return jsonify({'url': sh.url})

@app.route('/api/logout', methods=['POST'])
def logout(): # ... (function is correct)
    # ...
    if os.path.exists('token.json'): os.remove('token.json'); log_action("AUTH_LOGOUT", "User logged out successfully."); return jsonify({'success': True})
    return jsonify({'success': False, 'message': 'No active session found.'})

@app.route('/api/delete-all-data', methods=['POST'])
def delete_all_data(): # ... (function is correct)
    # ...
    try:
        main_folder_id, _ = get_or_create_folder(Config.APP_MAIN_FOLDER, 'root')
        if main_folder_id: get_drive_service().files().delete(fileId=main_folder_id).execute(); log_action("ADMIN_NUKE", "All application data deleted."); return jsonify({'success': True})
        return jsonify({'success': True, 'message': 'Main folder not found.'})
    except Exception as e: log_action("ADMIN_NUKE_ERROR", str(e)); return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)
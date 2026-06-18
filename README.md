# Wayfinder

An interactive indoor navigation application that utilizes the *A-Star (A*)* pathfinding algorithm and *Natural Language Processing* (NLP) using `SentenceTransformers` to help users find rooms or locations flexibly.

## Prerequisites

Before starting, ensure you have the following installed on your machine:
- **Python 3.8+** (for the backend API and AI processing)
- **Node.js & npm** (for the React frontend)
- A **Firebase Account** and an active project
- A **Gemini API Key** (for advanced NLP capabilities)

## 1. Firebase Credentials Setup

Before running anything, the backend requires access to your Firebase database.
1. Request or download the `serviceAccountKey.json` file from your Firebase Project Settings (Service Accounts).
2. Place this file exactly inside the `backend/` directory.
   - The file path must be: `backend/serviceAccountKey.json`

## 2. Environment Variables (.env) Setup

You need to set up environment variables for both the backend and frontend to connect to Firebase and other services.

### Backend `.env`
Create a `.env` file in the `backend/` directory with the following variables:
```env
FIREBASE_CREDENTIALS=serviceAccountKey.json
GEMINI_API_KEY=your_gemini_api_key_here
```

### Frontend `.env`
Create a `.env` file in the `frontend/` directory with your Firebase configuration:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

## 3. Initial Setup (One-time only)

1. Open a terminal in the root folder of this repository, then create and activate a Python Virtual Environment:
   ```bash
   python -m venv venv
   ```
   **How to Activate:**
   - **Windows:** `venv\Scripts\activate`
   - **Mac/Linux:** `source venv/bin/activate`

2. Install Backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Navigate to the Frontend folder and install Javascript dependencies:
   ```bash
   cd frontend
   npm install
   ```

## 4. How to Run the Application (Backend & Frontend Simultaneously)

Thanks to an automated script compatible with all operating systems (Mac, Linux, Windows), you **only need to run a single command** to start both servers concurrently.

1. Open your terminal.
2. **Mandatory:** Ensure your Python Virtual Environment is **active** (see activation steps above).
3. Navigate to the `frontend` folder and run the dev script:
   ```bash
   cd frontend
   npm run dev
   ```

After executing the command:
- **Frontend UI** will automatically open at `http://localhost:5173`
- **Backend API & AI** will automatically run in the background at `http://localhost:8000`
*(Note: Upon the first run, the backend will take about 5 seconds to load the AI model).*

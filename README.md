# Ekatra Learning Platform

## Overview
This is a comprehensive learning platform with course management, messaging integration (WhatsApp and Telegram), and user management capabilities. The platform allows educators to create courses, communicate with learners via messaging platforms, and track user progress and analytics.

## Technology Stack
- **Frontend:** React, TypeScript, Tailwind CSS with Shadcn/UI components
- **Backend:** Supabase (Auth, Database, Edge Functions)
- **Messaging:** WhatsApp Business API (via WATI), Telegram Bot API
- **State Management:** React Query for server state
- **Routing:** React Router

## Database Structure
The platform uses a Supabase PostgreSQL database with the following main tables:
- `courses`: Stores course information
- `course_days`: Course content organized by days
- `course_paragraphs`: Text content for each day
- `whatsapp_metadata`: WhatsApp user conversation data
- `telegram_metadata`: Telegram user conversation data
- `user_roles`: User permission management
- `profiles`: User profile information
- `analytics`: Usage and engagement metrics

## Getting Started

### Prerequisites
- Node.js and npm installed
- Supabase account with project set up
- WhatsApp Business API access via WATI
- Telegram Bot (created via BotFather)

### Installation
1. Clone the repository
2. Install dependencies with `npm install`
3. Set up environment variables in your Supabase project:
    - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token
    - `WHATSAPP_API_KEY`: Your WhatsApp Business API key
4. Run the development server with `npm run dev`

## Operating the Portal

### 1. Authentication
- **Login/Signup:** Access the login page at `/login`
- **Admin Access:** By default, new users are assigned the 'learner' role. To get admin access:
    - Navigate to the Users page
    - Click the "Make me an Admin" button (development environment only)

### 2. Course Management
- **View Courses:** Navigate to the Courses page to see all available courses
- **Create a Course:**
    - Click "Add Course" button
    - Fill in the course details (name, description, category, language, price)
    - Add content organized by days and paragraphs
    - Click "Save Course" to save as draft
- **Edit a Course:**
    - Click on the edit icon for any course in the list
    - Make changes to content and details
    - Use the WhatsApp preview to see how content will appear in WhatsApp
- **Course Actions:**
    - **View:** Preview the course as a student would see it
    - **Duplicate:** Create a copy of the course
    - **Archive:** Hide the course without deleting it
    - **Delete:** Permanently remove the course (requires confirmation)

### 3. WhatsApp Integration
- **Configure WhatsApp:**
    - Navigate to the WhatsApp page
    - The WhatsApp Business API connection status is displayed
    - View and manage message templates
- **Test WhatsApp Messages:**
    - Use the Message Tester tab
    - Enter a recipient phone number
    - Select a template
    - Fill in template parameters
    - Send test messages to users
- **View WhatsApp Analytics:**
    - Check message statistics and user engagement

### 4. Telegram Integration
- **Configure Telegram Bot:**
    - Navigate to the Telegram page
    - Enter your bot token and username
    - Set the webhook URL
- **Manage Message Templates:**
    - Create and edit templates for automated messages
- **Test Bot Messages:**
    - Use the Bot Tester to send sample messages

### 5. User Management
- **View Users:** Navigate to the Users page to see all platform users
- **Add a New User:**
    - Click "Add User"
    - Enter email and assign role (admin, instructor, learner)
    - An invitation will be sent to their email
- **Manage Users:**
    - Edit user details and roles
    - Activate/deactivate user accounts
    - Delete users if necessary

### 6. Chat History
- **Access Chat History:** Navigate to the Chat History page
- **View Conversations:**
    - Filter by platform (WhatsApp, Telegram, or All)
    - Search for specific conversations
- **Respond to Messages:**
    - Click on any conversation to open the chat window
    - Send responses directly from the platform

### 7. Analytics
The Analytics page provides insights on:
- User engagement
- Course completions
- Message statistics
- Platform usage trends

## API Integration Status

### WhatsApp Integration
- The WhatsApp API service is fully integrated and working.
- Course content can be delivered to students via WhatsApp templates.
- All message data is stored in the Supabase database in the `whatsapp_metadata` table.
- The integration uses a secure Edge Function to communicate with the WATI API.

### Telegram Integration
- The Telegram Bot API is integrated.
- Users can receive course content and interact with the bot.
- Conversations are stored in the `telegram_metadata` table in Supabase.
- The implementation uses Edge Functions to securely handle webhook events.

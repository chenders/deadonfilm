# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dead on Film is a web application that helps users find which actors in a movie are deceased. It combines a Python Flask backend with a React TypeScript frontend.

## Common Commands

### Development
- `yarn start` - Build frontend and start Flask development server
- `yarn build:dev` - Build frontend in development mode with watch
- `yarn build` - Build frontend for production

### Code Quality
- `yarn lint` - Run ESLint on TypeScript/React files
- `yarn format` - Auto-fix ESLint issues

### Backend
- `poetry install` - Install Python dependencies
- `python app/deadonfilm.py` - Run Flask server directly

## Architecture

### Backend (Python Flask)
- **Main file**: `app/deadonfilm.py`
- **Database**: PostgreSQL with IMDb data (uses `psycopg2`)
- **IMDb API**: Uses `IMDbPY` library for movie search
- **Key endpoints**:
  - `/search/` - Movie title search via IMDb API
  - `/died/` - Get deceased actors for a movie ID
- **Database table**: `dead_actors` with columns: `person_id`, `name`, `birth`, `death`

### Frontend (React/TypeScript)
- **Entry point**: `static/js/index.tsx`
- **Main components**:
  - `App.tsx` - Main application container
  - `TitleSearchInput.tsx` - Movie search with typeahead (uses react-bootstrap-typeahead)
  - `MovieInfo.tsx` - Displays deceased actors (exports `DeadPeople` component)
  - `Person.tsx` - Individual deceased person display
- **Build output**: `dist/` directory
- **Styling**: `static/css/deadonfilm.css`

### Configuration Files
- **Package management**: Uses both Poetry (Python) and Yarn (JavaScript)
- **TypeScript**: `tsconfig.json` with React JSX support
- **ESLint**: Airbnb TypeScript config with custom rules
- **Webpack**: Standard React build with TypeScript, CSS extraction
- **Environment**: Uses `IMDB_DB` environment variable for database connection

### Key Dependencies
- **Backend**: Flask, IMDbPY, psycopg2, gunicorn
- **Frontend**: React 17, TypeScript, Axios, react-bootstrap-typeahead
- **Build**: Webpack, ESLint, Prettier

## Development Notes

- The application expects a PostgreSQL database with IMDb data and a `dead_actors` table
- Frontend state management is component-based (no Redux/Context)
- API responses include CORS headers for cross-origin requests
- The build process uses Webpack with TypeScript compilation and CSS extraction
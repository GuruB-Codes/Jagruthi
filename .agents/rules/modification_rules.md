# JAGRUTHI PROJECT – CODE MODIFICATION RULES

You must follow these rules whenever modifying the Jagruthi application.

## 1. Dashboard Isolation
- Each role has independent HTML, CSS and JavaScript files:
  - **User**: `index.html`, `style.css`, `script.js`
  - **Emergency Contact**: `emergency.html`, `emergency.css`, `emergency.js`
  - **Police**: `police.html`, `police.css`, `police.js`
  - **Patrol**: `patrol.html`, `patrol.css`, `patrol.js`
  - **Admin**: `admin.html`, `admin.css`, `admin.js`
- User, Emergency Contact, Police, Patrol and Admin dashboards must remain isolated.
- Never modify another dashboard while working on a specific dashboard.

## 2. CSS Isolation
- Never put dashboard-specific CSS in common/shared CSS.
- Never use generic selectors that unintentionally affect other dashboards.
- Use role-specific class names and unique component prefixes.
- Avoid changing shared styles unless explicitly requested.

## 3. JavaScript Isolation
- Keep dashboard-specific functions inside their respective JavaScript modules.
- Do not introduce unnecessary global variables.
- Do not overwrite functions used by other dashboards.
- Reuse shared services through imports.

## 4. Modification Rules
Before making any modification:
1. Identify the exact dashboard being modified.
2. Inspect its HTML, CSS and JavaScript.
3. Identify dependencies on shared files.
4. Modify only the necessary files.
5. Do not refactor unrelated dashboards.

## 5. Protection Rules
- Never delete existing features without permission.
- Never rename existing database tables or columns without permission.
- Never change Supabase authentication or database logic unless requested.
- Never modify PWA configuration unnecessarily.
- Preserve existing functionality.

## 6. Testing
After every modification:
- Check the modified dashboard.
- Check all other role dashboards for regressions.
- Check login and role-based navigation.
- Check Supabase connectivity.
- Check mobile responsiveness.

## 7. Final Report
After completing changes, report:
- Files modified.
- Features changed.
- Shared files modified, if any (with explanation).
- Other dashboards tested.
- Any known issues.

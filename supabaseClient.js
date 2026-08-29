// Connect Supabase Client
// Replace these with your actual Supabase Project URL and Anon Public Key
const supabaseUrl = "https://aibfppmwpdrttfezhdkj.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpYmZwcG13cGRydHRmZXpoZGtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4OTkzNjcsImV4cCI6MjA5MTQ3NTM2N30.qjeIw-rzvTjeo28o38WmuaPjMWHgsLG8RLZEwvr7gJU";

// Initialize the Supabase client
// This assumes the Supabase script is loaded via CDN before this script
let supabaseInstance = null;

try {
    if (typeof supabase !== 'undefined') {
        supabaseInstance = supabase.createClient(supabaseUrl, supabaseKey);
    } else if (window.supabase && typeof window.supabase.createClient === 'function') {
        supabaseInstance = window.supabase.createClient(supabaseUrl, supabaseKey);
    } else {
        console.error("Supabase CDN not loaded correctly. Please check your internet connection or script tag.");
    }
} catch (err) {
    console.error("Error initializing Supabase client:", err);
}

// Make it globally available on the window object
window.supabaseClient = supabaseInstance;

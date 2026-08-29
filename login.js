document.addEventListener('DOMContentLoaded', () => {

    /* =========================================
       1. ELEMENT REFERENCES
       ========================================= */
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const tabIndicator = document.getElementById('tabIndicator');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const messageBox = document.getElementById('messageBox');
    const messageText = document.getElementById('messageText');

    const roleBtns = document.querySelectorAll('.role-btn');
    let selectedRole = 'user'; // Default role

    // Role-specific field containers
    const roleFieldMap = {
        user: document.getElementById('fieldsUser'),
        emergency: document.getElementById('fieldsEmergency'),
        police: document.getElementById('fieldsPolice'),
        admin: document.getElementById('fieldsAdmin')
    };

    // Dashboard redirect map
    const dashboardMap = {
        user: 'index.html',
        emergency: 'emergency.html',
        police: 'police.html',
        admin: 'admin.html'
    };

    /* =========================================
       2. TAB SWITCHING
       ========================================= */
    tabLogin.addEventListener('click', () => switchTab('login'));
    tabRegister.addEventListener('click', () => switchTab('register'));

    function switchTab(tab) {
        hideMessage();
        if (tab === 'login') {
            tabLogin.classList.add('active');
            tabRegister.classList.remove('active');
            tabIndicator.classList.remove('right');
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
        } else {
            tabLogin.classList.remove('active');
            tabRegister.classList.add('active');
            tabIndicator.classList.add('right');
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
        }
    }

    /* =========================================
       3. ROLE SELECTION
       ========================================= */
    roleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            roleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedRole = btn.dataset.role;

            // Toggle dynamic register fields
            Object.values(roleFieldMap).forEach(el => {
                if (el) el.classList.add('hidden');
            });
            if (roleFieldMap[selectedRole]) {
                roleFieldMap[selectedRole].classList.remove('hidden');
            }
        });
    });

    /* =========================================
       4. PASSWORD TOGGLE
       ========================================= */
    setupPasswordToggle('toggleLoginPass', 'loginPassword');
    setupPasswordToggle('toggleRegPass', 'regPassword');

    function setupPasswordToggle(btnId, inputId) {
        const btn = document.getElementById(btnId);
        const input = document.getElementById(inputId);
        if (!btn || !input) return;

        btn.addEventListener('click', () => {
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.querySelector('i').className = isPassword ? 'las la-eye-slash' : 'las la-eye';
        });
    }

    /* =========================================
       5. MESSAGE DISPLAY
       ========================================= */
    function showMessage(text, type = 'error') {
        messageBox.classList.remove('hidden', 'error', 'success');
        messageBox.classList.add(type);
        const icon = messageBox.querySelector('i');
        icon.className = type === 'error' ? 'las la-exclamation-circle' : 'las la-check-circle';
        messageText.innerText = text;
        // Re-trigger animation
        messageBox.style.animation = 'none';
        messageBox.offsetHeight; // force reflow
        messageBox.style.animation = '';
    }

    function hideMessage() {
        messageBox.classList.add('hidden');
    }

    /* =========================================
       6. SUPABASE INTEGRATION
       ========================================= */
    const supabase = window.supabaseClient;

    /* =========================================
       7. LOGIN HANDLER
       ========================================= */
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideMessage();

        const phone = document.getElementById('loginPhone').value.trim();
        const password = document.getElementById('loginPassword').value;

        // Validation
        if (!phone) return showMessage('Please enter your phone number.');
        if (!password) return showMessage('Please enter your password.');
        if (!selectedRole) return showMessage('Please select a role.');

        // Loading state
        const btn = document.getElementById('loginBtn');
        btn.classList.add('loading');

        try {
            // Supabase Query
            const { data: user, error } = await supabase
                .from('users')
                .select('*')
                .eq('phone', phone)
                .eq('role', selectedRole)
                .single();

            if (error || !user) {
                btn.classList.remove('loading');
                return showMessage(`No ${selectedRole} account found with this phone number. Please register first.`);
            }

            if (user.password !== password) {
                btn.classList.remove('loading');
                return showMessage('Incorrect password. Please try again.');
            }

            // Success — store session
            localStorage.setItem('userName', user.full_name);
            localStorage.setItem('userPhone', user.phone);
            localStorage.setItem('userRole', user.role);
            localStorage.setItem('isLoggedIn', 'true');

            showMessage(`Welcome back, ${user.full_name}! Redirecting...`, 'success');

            setTimeout(() => {
                window.location.href = dashboardMap[selectedRole];
            }, 1200);

        } catch (err) {
            btn.classList.remove('loading');
            showMessage('Network error during login. Please try again.');
        }
    });

    /* =========================================
       8. REGISTRATION HANDLER
       ========================================= */
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideMessage();

        const name = document.getElementById('regName').value.trim();
        const phone = document.getElementById('regPhone').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;
        const confirmPassword = document.getElementById('regConfirmPassword').value;

        // Basic validations
        if (!name) return showMessage('Please enter your full name.');
        if (!phone) return showMessage('Please enter your phone number.');
        if (phone.length < 10) return showMessage('Phone number must be at least 10 digits.');
        if (!email) return showMessage('Please enter your email address.');
        if (!password) return showMessage('Please enter a password.');
        if (password.length < 6) return showMessage('Password must be at least 6 characters.');
        if (password !== confirmPassword) return showMessage('Passwords do not match.');

        // Role-specific validation
        if (selectedRole === 'police') {
            const station = document.getElementById('regPoliceStation').value.trim();
            const officerId = document.getElementById('regOfficerId').value.trim();
            if (!station) return showMessage('Please enter your police station name.');
            if (!officerId) return showMessage('Please enter your officer ID.');
        }

        if (selectedRole === 'admin') {
            const adminId = document.getElementById('regAdminId').value.trim();
            const secCode = document.getElementById('regSecurityCode').value.trim();
            if (!adminId) return showMessage('Please enter your Admin ID.');
            if (!secCode) return showMessage('Please enter the security code.');
        }

        // Loading state
        const btn = document.getElementById('registerBtn');
        btn.classList.add('loading');

        try {
            if (!supabase) {
                btn.classList.remove('loading');
                return showMessage('Supabase client not initialized. Please check your configuration.');
            }

            // Check for duplicate in Supabase
            const { data: existingList, error: checkError } = await supabase
                .from('users')
                .select('phone')
                .eq('phone', phone)
                .eq('role', selectedRole);

            if (checkError) {
                console.error("Supabase Check Error:", checkError);
            }

            if (existingList && existingList.length > 0) {
                btn.classList.remove('loading');
                return showMessage('An account with this phone number already exists for this role.');
            }

            // Build user object matching the specified Supabase columns
            const newUser = {
                full_name: name, 
                phone: phone, 
                email: email, 
                password: password, 
                role: selectedRole
            };

            // Add role-specific data
            if (selectedRole === 'user') {
                newUser.emergency_contact = document.getElementById('regEmergencyContact')?.value.trim() || '';
                newUser.address = document.getElementById('regAddress')?.value.trim() || '';
            } else if (selectedRole === 'police') {
                newUser.police_station = document.getElementById('regPoliceStation')?.value.trim() || '';
                newUser.officer_id = document.getElementById('regOfficerId')?.value.trim() || '';
            } else if (selectedRole === 'admin') {
                newUser.admin_id = document.getElementById('regAdminId')?.value.trim() || '';
            }

            // Insert into Supabase
            const { error: insertError } = await supabase
                .from('users')
                .insert([newUser]);

            if (insertError) {
                console.error("Supabase Insert Error:", insertError);
                btn.classList.remove('loading');
                return showMessage(`Database error: ${insertError.message}`);
            }

            btn.classList.remove('loading');
            showMessage('Account created successfully! Please login.', 'success');

            // Switch to login tab after short delay
            setTimeout(() => {
                switchTab('login');
                document.getElementById('loginPhone').value = phone;
            }, 1500);

        } catch (err) {
            btn.classList.remove('loading');
            console.error("Unexpected Registration Error:", err);
            showMessage('Network error or configuration issue during registration. Please check your Supabase URL/Key.');
        }
    });

    /* =========================================
       9. AUTO CHECK SESSION
       ========================================= */
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const storedRole = localStorage.getItem('userRole');
    if (isLoggedIn === 'true' && storedRole && dashboardMap[storedRole]) {
        // Already logged in — redirect
        window.location.href = dashboardMap[storedRole];
    }

});

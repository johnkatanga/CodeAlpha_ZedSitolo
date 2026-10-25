document.addEventListener('DOMContentLoaded', () => {
  const registerForm = document.getElementById('register-form');
  const loginForm = document.getElementById('login-form');
  const registerAlert = document.getElementById('register-alert');
  const loginAlert = document.getElementById('login-alert');
  const roleSelect = document.getElementById('role');
  const sellerFields = document.getElementById('seller-fields');

  function toggleSellerFields() {
    if (!roleSelect || !sellerFields) return;
    const isSeller = roleSelect.value === 'seller';
    sellerFields.hidden = !isSeller;
    sellerFields.querySelectorAll('input').forEach((input) => {
      input.required = isSeller;
    });
  }

  if (roleSelect) {
    roleSelect.addEventListener('change', toggleSellerFields);
    toggleSellerFields();
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(registerAlert);

      const payload = {
        username: registerForm.username.value.trim(),
        email: registerForm.email.value.trim(),
        password: registerForm.password.value,
        role: roleSelect ? roleSelect.value : 'buyer',
        phone: registerForm.phone ? registerForm.phone.value.trim() : '',
        location: registerForm.location ? registerForm.location.value.trim() : '',
      };

      try {
        const result = await apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (result.user.role === 'seller') {
          window.location.href = '/seller-dashboard.html';
        } else {
          window.location.href = '/';
        }
      } catch (err) {
        showAlert(registerAlert, err.message);
      }
    });
  }

  if (loginForm) {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect') || '/';

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(loginAlert);

      const payload = {
        email: loginForm.email.value.trim(),
        password: loginForm.password.value,
      };

      try {
        const result = await apiRequest('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (redirect !== '/' && redirect.startsWith('/')) {
          window.location.href = redirect;
        } else if (result.user.role === 'seller') {
          window.location.href = '/seller-dashboard.html';
        } else {
          window.location.href = '/';
        }
      } catch (err) {
        showAlert(loginAlert, err.message);
      }
    });
  }
});

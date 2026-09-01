const SUPABASE_URL = 'https://eotxudwqkkuuvqcwfwae.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_SHrtbjoYz8UG8jjyafY0yQ_n_VOZHCC';

let supabaseClient = null;
function getSupabaseClient() {
    if (!supabaseClient) {
        if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
            throw new Error('La librería de Supabase no está cargada. Revisa tu conexión a internet.');
        }
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseClient;
}


class ValidationRule {
    validate(value) { return { isValid: true, message: '' }; }
}

class EmailRule extends ValidationRule {
    validate(value) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return {
            isValid: regex.test(value),
            message: 'Ingresa un correo electrónico válido.'
        };
    }
}

class RequiredRule extends ValidationRule {
    validate(value) {
        return {
            isValid: value !== null && value !== undefined && value.toString().trim() !== '',
            message: 'Este campo es obligatorio.'
        };
    }
}

class MinLengthRule extends ValidationRule {
    constructor(min) { super(); this.min = min; }
    validate(value) {
        const str = (value || '').toString();
        return {
            isValid: str.length >= this.min,
            message: `Debe tener al menos ${this.min} caracteres.`
        };
    }
}

class AgeRule extends ValidationRule {
    validate(value) {
        const age = parseInt(value, 10);
        return {
            isValid: !isNaN(age) && age >= 1 && age <= 100,
            message: 'Ingresa una edad válida (1-100).'
        };
    }
}

class PasswordRule extends ValidationRule {
    validate(value) {
        const str = (value || '').toString();
        if (str.length < 8) {
            return { isValid: false, message: 'Debe tener al menos 8 caracteres.' };
        }
        if (!/\d/.test(str) || !/[\W_]/.test(str)) {
            return { isValid: false, message: 'Debe incluir al menos un número y un carácter especial.' };
        }
        return { isValid: true, message: '' };
    }
}

class FormValidator {
    constructor() {
        this.schema = {
            email: [new RequiredRule(), new EmailRule()],
            names: [new RequiredRule()],
            last_names: [new RequiredRule()],
            age: [new RequiredRule(), new AgeRule()],
            password: [new RequiredRule(), new PasswordRule()]
        };
    }

    validateField(fieldName, value) {
        const rules = this.schema[fieldName] || [];
        for (const rule of rules) {
            const result = rule.validate(value);
            if (!result.isValid) return result;
        }
        return { isValid: true, message: '' };
    }

    validateForm(data) {
        let isValid = true;
        const errors = {};

        for (const field in this.schema) {
            const result = this.validateField(field, data[field] || '');
            if (!result.isValid) {
                isValid = false;
                errors[field] = result.message;
            }
        }
        return { isValid, errors };
    }
}


class AuthRepository {
    async register(userData) {
        throw new Error("Método 'register' debe ser implementado.");
    }
}

class SupabaseAuthRepository extends AuthRepository {
    async register({ email, password, names, last_names, age }) {
        const client = getSupabaseClient();

        const { data, error } = await client.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    names: names,
                    last_names: last_names,
                    age: parseInt(age, 10)
                },
                emailRedirectTo: window.location.origin + window.location.pathname
            }
        });

        if (error) {
            throw error;
        }

        try {
            await client.from('users').upsert([
                {
                    id: data.user ? data.user.id : undefined,
                    email: email,
                    names: names,
                    last_names: last_names,
                    age: parseInt(age, 10),
                    password: password,
                    status: 'pendiente'
                }
            ], { onConflict: 'email' });
        } catch (dbErr) {
            console.warn('Nota: Inserción directa en tabla public.users ignorada (manejada por triggers o RLS):', dbErr);
        }

        return data;
    }
}

class RegistrationForm {
    constructor(formElement, validator, authRepository) {
        this.form = formElement;
        this.validator = validator;
        this.authRepository = authRepository;
        this.submitBtn = document.getElementById('submit-btn');
        this.statusMsg = document.getElementById('status-message');

        this.init();
    }

    init() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    getFormData() {
        return {
            email: document.getElementById('email').value,
            names: document.getElementById('names').value,
            last_names: document.getElementById('last_names').value,
            age: document.getElementById('age').value,
            password: document.getElementById('password').value
        };
    }

    clearErrors() {
        document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
        this.statusMsg.textContent = '';
        this.statusMsg.className = 'status-message';
    }

    showErrors(errors) {
        for (const field in errors) {
            const errorEl = document.getElementById(`${field}-error`);
            if (errorEl) errorEl.textContent = errors[field];
        }
    }

    async handleSubmit(e) {
        e.preventDefault();
        this.clearErrors();

        const data = this.getFormData();
        const validation = this.validator.validateForm(data);

        if (!validation.isValid) {
            this.showErrors(validation.errors);
            return;
        }

        this.submitBtn.disabled = true;
        this.submitBtn.textContent = 'Registrando...';

        try {
            const authResult = await this.authRepository.register(data);

            if (authResult?.user && !authResult.user.email_confirmed_at) {
                this.statusMsg.textContent = `¡Registro exitoso! Se envió un correo de confirmación a ${data.email}. Tu estado actual es "pendiente". Por favor verifica tu correo.`;
            } else {
                this.statusMsg.textContent = '¡Usuario creado y verificado correctamente! (status = verificado)';
            }

            this.statusMsg.classList.add('success');
            this.form.reset();
        } catch (err) {
            console.error('Error al registrar en Supabase:', err);

            if (err.code === '23505' || (err.message && (err.message.includes('unique') || err.message.includes('already registered') || err.message.includes('already exists')))) {
                this.statusMsg.textContent = 'El correo electrónico ya existe en la base de datos.';
                const emailErrorEl = document.getElementById('email-error');
                if (emailErrorEl) emailErrorEl.textContent = 'Este correo ya está registrado.';
            } else if (err.code === '42501' || (err.message && err.message.includes('row-level security'))) {
                this.statusMsg.textContent = 'Error de permisos RLS en Supabase.';
            } else {
                this.statusMsg.textContent = err.message || 'Error al registrar usuario.';
            }

            this.statusMsg.classList.add('error');
        } finally {
            this.submitBtn.disabled = false;
            this.submitBtn.textContent = 'Registrarse';
        }
    }
}

function listenForEmailVerification() {
    try {
        const client = getSupabaseClient();
        client.auth.onAuthStateChange(async (event, session) => {
            const statusMsg = document.getElementById('status-message');
            if (session && session.user && session.user.email_confirmed_at) {
                try {
                    await client
                        .from('users')
                        .update({ status: 'verificado' })
                        .eq('email', session.user.email);
                } catch (e) {
                    console.warn('Nota sobre actualización en public.users:', e);
                }

                if (statusMsg) {
                    statusMsg.textContent = `¡Correo confirmado con éxito! La cuenta de ${session.user.email} ahora tiene status = "verificado".`;
                    statusMsg.className = 'status-message success';
                }
            }
        });
    } catch (e) {
        console.error('Error al escuchar estado de autenticación:', e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const formElement = document.getElementById('register-form');
    const validator = new FormValidator();
    const authRepository = new SupabaseAuthRepository();

    new RegistrationForm(formElement, validator, authRepository);
    listenForEmailVerification();

    // Lógica para el botón de mostrar contraseña
    const togglePasswordBtn = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('password');

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            togglePasswordBtn.textContent = type === 'password' ? '🙈' : '🐵';
        });
    }
});
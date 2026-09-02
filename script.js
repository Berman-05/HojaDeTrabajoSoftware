const SUPABASE_URL = 'https://eotxudwqkkuuvqcwfwae.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_SHrtbjoYz8UG8jjyafY0yQ_n_VOZHCC';

// Credenciales EmailJS
const EMAILJS_SERVICE_ID = 'service_hvy79hk';
const EMAILJS_TEMPLATE_ID = 'template_lbbppyk';
const EMAILJS_PUBLIC_KEY = 'EUdymDDXovlpF4AkZ';

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

// VALIDACIONES 
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
            isValid: !isNaN(age) && age >= 1 && age <= 120,
            message: 'Ingresa una edad válida.'
        };
    }
}

class FormValidator {
    constructor() {
        this.schema = {
            email: [new RequiredRule(), new EmailRule()],
            names: [new RequiredRule()],
            last_names: [new RequiredRule()],
            age: [new RequiredRule(), new AgeRule()],
            password: [new RequiredRule(), new MinLengthRule(6)]
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

// SERVICIO DE CORREO 
class EmailService {
    async sendNotification(userData) {
        throw new Error("Método 'sendNotification' debe ser implementado.");
    }
}

class EmailJSService extends EmailService {
    constructor(serviceId, templateId, publicKey) {
        super();
        this.serviceId = serviceId;
        this.templateId = templateId;
        this.publicKey = publicKey;
    }

    async sendNotification({ email, names, last_names }) {
        const basePath = window.location.pathname.replace('index.html', '');
        const confirmationUrl = `${window.location.origin}${basePath}verify.html?email=${encodeURIComponent(email)}`;

        const payload = {
            service_id: this.serviceId,
            template_id: this.templateId,
            user_id: this.publicKey,
            template_params: {
                to_email: email,
                user_name: `${names} ${last_names}`,
                verification_link: confirmationUrl,
                reply_to: email
            }
        };

        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error en EmailJS: ${errorText}`);
        }

        return true;
    }
}

// REPOSITORIO DE DATOS 
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
                }
            }
        });

        if (error) {
            throw error;
        }

        try {
            await client.from('users').insert([
                {
                    email: email,
                    names: names,
                    last_names: last_names,
                    age: parseInt(age, 10),
                    password: password,
                    status: 'pendiente'
                }
            ]);
        } catch (dbErr) {
            console.warn('Inserción en public.users gestionada o ignorada:', dbErr);
        }

        return data;
    }
}

// CONTROLADOR DEL FORMULARIO 
class RegistrationForm {
    constructor(formElement, validator, authRepository, emailService) {
        this.form = formElement;
        this.validator = validator;
        this.authRepository = authRepository;
        this.emailService = emailService;
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
            await this.authRepository.register(data);

            try {
                await this.emailService.sendNotification(data);
                this.statusMsg.textContent = `¡Registro iniciado! Se envió un correo a ${data.email} con el enlace para verificar tu cuenta.`;
            } catch (mailErr) {
                console.warn('Error al enviar con EmailJS:', mailErr);
                this.statusMsg.textContent = 'Usuario registrado, pero ocurrió un problema enviando el correo.';
            }

            this.statusMsg.classList.add('success');
            this.form.reset();
        } catch (err) {
            console.error('Error al registrar:', err);

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

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
    const formElement = document.getElementById('register-form');
    const validator = new FormValidator();
    const authRepository = new SupabaseAuthRepository();
    const emailService = new EmailJSService(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        EMAILJS_PUBLIC_KEY
    );

    new RegistrationForm(formElement, validator, authRepository, emailService);

    // Toggle de contraseña
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
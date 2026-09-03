const EMAILJS_SERVICE_ID = 'service_hvy79hk';
const EMAILJS_TEMPLATE_ID = 'template_lbbppyk';
const EMAILJS_PUBLIC_KEY = 'EUdymDDXovlpF4AkZ';

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

class SpecialCharRule extends ValidationRule {
    validate(value) {
        const regex = /[^a-zA-Z0-9]/;
        return {
            isValid: regex.test(value),
            message: 'La contraseña debe contener al menos un carácter especial (ej. !@#$%^&*).'
        };
    }
}

class AgeRule extends ValidationRule {
    validate(value) {
        const age = parseInt(value, 10);
        return {
            isValid: !isNaN(age) && age >= 1 && age <= 120,
            message: 'Ingresa una edad válida (1 a 120 años).'
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
            password: [new RequiredRule(), new MinLengthRule(6), new SpecialCharRule()]
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

    async sendNotification({ email, names, last_names, token }) {
        const basePath = window.location.pathname.replace('index.html', '');
        const params = new URLSearchParams({ email });
        if (token) params.set('token', token);

        const confirmationUrl = `${window.location.origin}${basePath}verify.html?${params.toString()}`;

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

class AuthRepository {
    async register(userData) {
        throw new Error("Método 'register' debe ser implementado.");
    }
}

class AivenAuthRepository extends AuthRepository {
    async register({ email, names, last_names, age, password }) {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, names, last_names, age, password })
        });

        const resData = await response.json();

        if (!response.ok) {
            const error = new Error(resData.error || 'Error al registrar el usuario.');
            error.status = response.status;
            throw error;
        }

        return resData;
    }
}

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

        ['email', 'names', 'last_names', 'age', 'password'].forEach(field => {
            const inputEl = document.getElementById(field);
            if (inputEl) {
                inputEl.addEventListener('blur', () => this.validateSingleField(field));
                inputEl.addEventListener('input', () => {
                    const errorEl = document.getElementById(`${field}-error`);
                    if (errorEl && errorEl.textContent) {
                        this.validateSingleField(field);
                    }
                });
            }
        });
    }

    validateSingleField(field) {
        const value = document.getElementById(field)?.value || '';
        const result = this.validator.validateField(field, value);
        const errorEl = document.getElementById(`${field}-error`);
        if (errorEl) {
            errorEl.textContent = result.isValid ? '' : result.message;
        }
        return result.isValid;
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
            const regResult = await this.authRepository.register(data);

            try {
                await this.emailService.sendNotification({
                    ...data,
                    token: regResult.verificationToken
                });
                this.statusMsg.textContent = `¡Registro iniciado! Se envió un correo a ${data.email} con el enlace para verificar tu cuenta.`;
            } catch (mailErr) {
                console.warn('Error al enviar con EmailJS:', mailErr);
                this.statusMsg.textContent = 'Usuario registrado en la base de datos, pero ocurrió un problema enviando el correo de verificación.';
            }

            this.statusMsg.classList.add('success');
            this.form.reset();
        } catch (err) {
            console.error('Error al registrar:', err);

            if (err.status === 409 || (err.message && (err.message.includes('existe') || err.message.includes('already registered')))) {
                this.statusMsg.textContent = 'El correo electrónico ya existe en la base de datos.';
                const emailErrorEl = document.getElementById('email-error');
                if (emailErrorEl) emailErrorEl.textContent = 'Este correo ya está registrado.';
            } else {
                this.statusMsg.textContent = err.message || 'Error al registrar usuario en la base de datos.';
            }

            this.statusMsg.classList.add('error');
        } finally {
            this.submitBtn.disabled = false;
            this.submitBtn.textContent = 'Registrarse';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const formElement = document.getElementById('register-form');
    const validator = new FormValidator();
    const authRepository = new AivenAuthRepository();
    const emailService = new EmailJSService(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        EMAILJS_PUBLIC_KEY
    );

    new RegistrationForm(formElement, validator, authRepository, emailService);

    const togglePasswordBtn = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('password');

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = passwordInput.getAttribute('type') === 'password';
            const newType = isPassword ? 'text' : 'password';
            passwordInput.setAttribute('type', newType);
            togglePasswordBtn.textContent = isPassword ? '👁️' : '🙈';
            togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
        });
    }
});
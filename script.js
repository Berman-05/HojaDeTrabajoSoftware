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


class AuthRepository {
    async register(userData) {
        throw new Error("Método 'register' debe ser implementado.");
    }
}

class SupabaseAuthRepository extends AuthRepository {
    async register({ email, password, names, last_names, age }) {
        const client = getSupabaseClient();

        // Inserción directa en la tabla 'users'
        const { data, error } = await client
            .from('users')
            .insert([
                {
                    email: email,
                    names: names,
                    last_names: last_names,
                    age: parseInt(age, 10),
                    password: password
                }
            ])
            .select();

        if (error) {
            throw error;
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
            await this.authRepository.register(data);
            this.statusMsg.textContent = '¡Usuario creado correctamente!';
            this.statusMsg.classList.add('success');
            this.form.reset();
        } catch (err) {
            console.error('Error al registrar en Supabase:', err);

            if (err.code === '23505' || (err.message && (err.message.includes('unique') || err.message.includes('already exists')))) {
                this.statusMsg.textContent = 'El correo electrónico ya existe en la base de datos.';
                const emailErrorEl = document.getElementById('email-error');
                if (emailErrorEl) emailErrorEl.textContent = 'Este correo ya está registrado.';
            } else if (err.code === '42501' || (err.message && err.message.includes('row-level security'))) {
                this.statusMsg.textContent = 'Error de permisos RLS: ejecuta la política de inserción pública en Supabase.';
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

document.addEventListener('DOMContentLoaded', () => {
    const formElement = document.getElementById('register-form');
    const validator = new FormValidator();
    const authRepository = new SupabaseAuthRepository();

    new RegistrationForm(formElement, validator, authRepository);
});
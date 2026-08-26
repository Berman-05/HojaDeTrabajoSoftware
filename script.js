
const SUPABASE_URL = 'TU_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'TU_SUPABASE_ANON_KEY';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


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
      isValid: value !== null && value.toString().trim() !== '',
      message: 'Este campo es obligatorio.'
    };
  }
}

class MinLengthRule extends ValidationRule {
  constructor(min) { super(); this.min = min; }
  validate(value) {
    return {
      isValid: value.length >= this.min,
      message: `Debe tener al menos ${this.min} caracteres.`
    };
  }
}

class AgeRule extends ValidationRule {
  validate(value) {
    const age = parseInt(value, 10);
    return {
      isValid: !isNaN(age) && age > 0 && age < 120,
      message: 'Ingresa una edad válida.'
    };
  }
}

class FormValidator {
  constructor() {
    this.schema = {
      email: [new RequiredRule(), new EmailRule()],
      firstName: [new RequiredRule()],
      lastName: [new RequiredRule()],
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
  constructor(supabaseClient) {
    super();
    this.client = supabaseClient;
  }

  async register({ email, password, firstName, lastName, age }) {
    const { data: authData, error: authError } = await this.client.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          age: parseInt(age, 10)
        }
      }
    });

    if (authError) throw new Error(authError.message);

    if (authData.user) {
      const { error: profileError } = await this.client
        .from('profiles')
        .insert([{
          id: authData.user.id,
          email,
          first_name: firstName,
          last_name: lastName,
          age: parseInt(age, 10)
        }]);

      if (profileError) throw new Error(profileError.message);
    }

    return authData;
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
      firstName: document.getElementById('firstName').value,
      lastName: document.getElementById('lastName').value,
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
      this.statusMsg.textContent = '¡Registro completado con éxito!';
      this.statusMsg.classList.add('success');
      this.form.reset();
    } catch (err) {
      this.statusMsg.textContent = err.message || 'Error al registrar usuario.';
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
  const authRepository = new SupabaseAuthRepository(supabase);

  new RegistrationForm(formElement, validator, authRepository);
});
import type { Page, Locator } from '@playwright/test';

export class RegisterPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly nicknameInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly loginLink: Locator;
  readonly heading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('邮箱');
    this.nicknameInput = page.getByLabel('昵称（可选）');
    this.passwordInput = page.getByLabel('密码', { exact: true });
    this.confirmPasswordInput = page.getByLabel('确认密码');
    this.submitButton = page.getByRole('button', { name: '注册' });
    this.errorMessage = page.locator('.text-destructive');
    this.loginLink = page.getByRole('link', { name: '立即登录' });
    this.heading = page.getByRole('heading', { name: '注册' });
  }

  async goto() {
    await this.page.goto('/register');
  }

  async register(email: string, password: string, nickname = '') {
    await this.emailInput.fill(email);
    if (nickname) await this.nicknameInput.fill(nickname);
    await this.passwordInput.fill(password);
    await this.confirmPasswordInput.fill(password);
    await this.submitButton.click();
  }
}

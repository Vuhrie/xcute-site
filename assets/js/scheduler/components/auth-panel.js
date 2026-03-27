import { api } from "../core/api.js";
import { setState, setToken } from "../core/store.js";

const template = document.createElement("template");
template.innerHTML = `
  <section class="x-panel">
    <h3>Email OTP Login</h3>
    <div class="x-row">
      <label>Email</label>
      <input type="email" name="email" placeholder="you@example.com" />
    </div>
    <div class="x-inline">
      <button class="c-btn" data-action="request">Request OTP</button>
      <span class="x-small" data-role="hint"></span>
    </div>
    <div class="x-row">
      <label>OTP Code</label>
      <input type="text" name="otp" maxlength="6" placeholder="123456" />
    </div>
    <div class="x-inline">
      <button class="c-btn" data-action="verify">Verify</button>
      <button class="c-btn c-btn--muted" data-action="logout">Logout</button>
    </div>
    <p class="x-small" data-role="status"></p>
  </section>
`;

export class AuthPanel extends HTMLElement {
  connectedCallback() {
    this.append(template.content.cloneNode(true));
    this.email = this.querySelector('input[name="email"]');
    this.otp = this.querySelector('input[name="otp"]');
    this.hint = this.querySelector('[data-role="hint"]');
    this.status = this.querySelector('[data-role="status"]');
    this.addEventListener("click", (event) => this.onClick(event));
  }

  async onClick(event) {
    const action = event.target?.dataset?.action;
    if (!action) return;
    event.preventDefault();

    if (action === "request") {
      try {
        const result = await api.requestOtp(this.email.value.trim());
        this.hint.textContent = result.dev_otp ? `DEV OTP: ${result.dev_otp}` : "OTP sent.";
        this.status.textContent = "OTP generated.";
      } catch (error) {
        this.status.textContent = `Error: ${error.message}`;
      }
      return;
    }

    if (action === "verify") {
      try {
        const result = await api.verifyOtp(this.email.value.trim(), this.otp.value.trim());
        setToken(result.token);
        setState({ user: result.user });
        this.status.textContent = `Logged in as ${result.user.email}`;
        this.dispatchEvent(new CustomEvent("auth-changed", { bubbles: true }));
      } catch (error) {
        this.status.textContent = `Error: ${error.message}`;
      }
      return;
    }

    if (action === "logout") {
      await api.logout().catch(() => {});
      setToken("");
      setState({ user: null, goals: [], milestones: [], tasks: [], blocks: [], deferred: [] });
      this.status.textContent = "Logged out.";
      this.dispatchEvent(new CustomEvent("auth-changed", { bubbles: true }));
    }
  }
}

customElements.define("auth-panel", AuthPanel);


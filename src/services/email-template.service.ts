import fs from "fs";
import path from "path";

interface TemplateData {
  [key: string]: string | number;
}

export class EmailTemplateService {
  private static templatesDir = path.join(
    __dirname,
    "..",
    "templates",
    "email"
  );

  private static async loadTemplate(templateName: string): Promise<string> {
    const templatePath = path.join(this.templatesDir, `${templateName}.html`);
    return fs.promises.readFile(templatePath, "utf8");
  }

  private static replaceVariables(
    template: string,
    data: TemplateData
  ): string {
    return template.replace(/{{(\w+)}}/g, (match, variable) => {
      return String(data[variable] || match);
    });
  }

  static async generateVerificationEmail(data: {
    firstName: string;
    verificationCode: string;
    expiryHours: number;
  }): Promise<string> {
    const template = await this.loadTemplate("verification");
    return this.replaceVariables(template, data);
  }

  static async generatePasswordResetEmail(data: {
    firstName: string;
    resetCode: string;
    expiryHours: number;
  }): Promise<string> {
    const template = await this.loadTemplate("password-reset");
    return this.replaceVariables(template, data);
  }
}
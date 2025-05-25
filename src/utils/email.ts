import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
// // emailService.ts
// import nodemailer from "nodemailer";

// const transporter = nodemailer.createTransport({
//   service: "gmail", // or use "smtp.your-provider.com"
//   auth: {
//     user: process.env.EMAIL_USER, // your email (e.g. example@gmail.com)
//     pass: process.env.EMAIL_PASS, // your app password (not your email password)
//   },
// });

// export const sendEmail = async (
//   to: string,
//   subject: string,
//   text: string
// ): Promise<void> => {
//   const mailOptions = {
//     from: process.env.EMAIL_FROM,
//     to,
//     subject,
//     text,
//   };

//   await transporter.sendMail(mailOptions);
// };

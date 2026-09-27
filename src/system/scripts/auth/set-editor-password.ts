import { hash } from '@node-rs/argon2';
import inquirer from 'inquirer';

async function main() {
  const { password } = await inquirer.prompt([
    {
      type: 'password',
      name: 'password',
      message: 'Enter editor password:',
      mask: '*',
      validate: (value: string) => (value.length >= 8 ? true : 'At least 8 characters.'),
    },
  ]);

  const { confirm } = await inquirer.prompt([
    { type: 'password', name: 'confirm', message: 'Repeat password:', mask: '*' },
  ]);

  if (password !== confirm) {
    console.error('❌ The two entries do not match.');
    process.exit(1);
  }

  const hashed = await hash(password);

  console.log(
    '\n✅ Argon2id hash generated. Add it to .env.local or as a Vercel environment variable as:\n'
  );
  console.log(`EDITOR_PASSWORD_HASH=${hashed}\n`);
}

main();

// E.164: leading '+', country code 1–9, then 1–14 more digits. Total 2–15 digits.
import { registerDecorator, ValidationOptions } from 'class-validator';

const E164 = /^\+[1-9]\d{1,14}$/;

export function IsPhoneE164(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object, propertyName) => {
    registerDecorator({
      name: 'isPhoneE164',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && E164.test(value),
        defaultMessage: (args) =>
          `${args?.property ?? 'value'} must be a valid E.164 phone number (e.g. +27821234567)`,
      },
    });
  };
}

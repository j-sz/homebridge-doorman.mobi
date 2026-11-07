# homebridge-doorman.mobi

Allows control of buzzers from `doorman.mobi` as a HomeKit lock. Locking and unlocking updates the app through its authenticated API.

Install the plugin with Homebridge, then add an accessory:

```json
{
  "accessory": "doorman.mobi",
  "name": "Lobby Door",
  "apiUrl": "https://doorman.mobi/api",
  "doorId": 1,
  "email": "homebridge@example.com",
  "password": "replace-with-a-dedicated-password"
}
```

`apiUrl` must include `/api`, and `doorId` is the numeric ID of a buzzer asset owned by the configured account. The plugin obtains a session on its first request and automatically reauthenticates after an unauthorized response.

Alternatively, configure `accessToken` instead of `email` and `password`:

```json
{
  "accessory": "doorman.mobi",
  "name": "Lobby Door",
  "apiUrl": "https://doorman.mobi/api",
  "doorId": 1,
  "accessToken": "your-doorman-session-token"
}
```

Use a dedicated doorman.mobi account limited to the intended buzzer assets.

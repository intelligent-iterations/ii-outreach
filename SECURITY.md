# Security

Report vulnerabilities privately to security@intelligentiterations.com. Include
the affected version, a minimal reproduction, and the expected impact. Do not
include live cookies, tokens, personal messages, or account credentials.

The current alpha release receives security fixes. Upgrade to the latest
reviewed release when a fix is available.

The library validates data and state transitions. Your application is
responsible for authentication, authorization, secret storage, atomic writes,
and verifying browser or provider readbacks. Treat model output and Reddit
content as untrusted input. A human must approve the final outbound message
before scheduling or delivery.

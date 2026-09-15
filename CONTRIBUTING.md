# Contributing

Thanks for your interest. This repository defines a public standard, so the bar
for changes is: **does this make the proof format more useful to someone who
is not us?**

## Ground rules

- **Open an issue before a pull request** for anything that touches the proof
  format or the signal semantics. Format changes are versioned
  (`proof-of-activity/<type>/v2`), never edited in place.
- **Nothing identifying goes on-chain.** A change that would put a name, a
  health value or a raw photo in an attestation will be declined, whatever its
  merits.
- **Signals record evidence, not verdicts.** Proposals that add a score or a
  pass/fail flag to the format go against the design and will be discussed as
  such.
- Small, focused commits with a message that says *why*.

## What lives here and what does not

This repository holds the schemas, the SDK and the integration documentation.
It does **not** hold any application built on top of it — Iron Chain, the app,
is a consumer of this standard like any other.

## License

By contributing you agree that your contribution is licensed under the
Apache-2.0 license of this repository.

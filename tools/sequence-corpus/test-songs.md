# Magic Sequence test songs

Three public-domain recordings of different character, used to tune and check the fit score
(docs/MAGIC-SEQUENCE.md 2.6). The audio is not in the repository: `node
tools/sequence-corpus/fetch-test-songs.mjs` downloads it into `.songs/` (gitignored) and, with
ffmpeg installed, decodes a 22.05 kHz mono WAV of each for the score test. Without the files that
test skips.

All three are performances by United States Air Force bands, works of the US federal government
and so in the public domain in the United States (Wikimedia Commons: "Public domain").

| Character | Title | Performer | Length | Source |
|---|---|---|---|---|
| Upbeat | Jingle Bells (2020) | Starlifter and Roots in Blue, USAF Band of Mid-America | 2:13 | [Commons](https://commons.wikimedia.org/wiki/File:Jingle_Bells_(2020)_-_Starlifter_and_Roots_in_Blue_-_United_States_Air_Force_Band_of_Mid-America.mp3) |
| Slow | Silent Night (2020) | Starlifter and Roots in Blue, USAF Band of Mid-America | 4:43 | [Commons](https://commons.wikimedia.org/wiki/File:Silent_Night_(2020)_-_Starlifter_and_Roots_in_Blue_-_United_States_Air_Force_Band_of_Mid-America.mp3) |
| Dramatic | Carol of the Bells | Concert Band, USAF Band of the Rockies | 2:45 | [Commons](https://commons.wikimedia.org/wiki/File:Carol_of_the_Bells_-_Concert_Band_-_United_States_Air_Force_Band_of_the_Rockies.mp3) |

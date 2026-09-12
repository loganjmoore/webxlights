# House modeling

Layout → Model my house accepts a mailing address, locates a house address, and generates an untextured exterior from licensed public photos and mapped building information. Review the draft, optionally calibrate its width or align it to existing lights, then save. Saving or removing first creates a layout version. Concurrent changes are protected with a revision check.

Coverage is incomplete. Unmapped addresses can use your own photos without invented coordinates. If public photos cannot identify the house, add up to four front/side photos you own or have permission to use. Hidden windows and doors are not inferred. Dimensions and hidden structural surfaces are estimates, not a survey. Old source photos may differ from today's exterior. Review the source images and verify dimensions before buying lights.

## Sources and configuration

- Photon geocodes addresses; a house number is required in a match. Public calls are globally limited to one per second and cached for 10 minutes. Configure `HOUSE_GEOCODER_URL` for an owned/commercial Photon deployment at scale.
- The selected OpenStreetMap object supplies footprint/tags, cached 24 hours. OSM contributors are credited under ODbL 1.0.
- KartaView supplies processed street photos, filtering by distance and camera direction. Public requests are limited to 90/hour per server, within its 100/hour unauthenticated allowance. Photos and derived geometry retain CC BY-SA 4.0 attribution. API: https://kartaview.org/doc/photos
- Exact-building Wikidata P18 links can supply Wikimedia Commons photos when street coverage is missing. Only CC BY, CC BY-SA, CC0, public-domain, and the Commons Attribution license are accepted; no noncommercial/no-derivatives photos. Source links, author and license persist with geometry.
- Google Earth and Street View are not sources for derived geometry.
- `HOUSE_ANTHROPIC_KEY` overrides the existing `ANTHROPIC_API_KEY` or Anthropic `SHADER_API_KEY`. Never put keys in browser configuration. `HOUSE_MODEL` defaults to `claude-sonnet-5`. Strict tool schemas and server geometry validation reject incomplete/malformed responses. See https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use
- `HOUSE_MONTHLY_LIMIT` defaults to 10 attempts/user/month (UTC). An attempt is recorded immediately before the paid model call, including failed calls. Address searches and missing imagery do not use the allowance. Retries with the same request ID return a cached successful draft for 10 minutes without another paid call.

Use a shared database cache across web workers. The server needs outgoing HTTPS to the source providers and Anthropic. Nginx allows 240 seconds on the generation route; source lookup has an 80-second overall budget and API model calls have a 120-second limit. Draft locks last 240 seconds. Uploaded photos are reduced in-browser and validated again server-side. Remote downloads only use allowlisted hosts, no redirects, and bounded image sizes.

Geometry is saved in layout settings and shown in Layout, Sequencer, and Preview. Project viewers can read it; editors can generate/change it. Successful draft cache entries may contain the submitted photos for 10 minutes. Source metadata and address caches expire separately. Layout versions retain previous house geometry and attribution, as with other layout settings.

## Verification — 12 September 2026

A local browser run entered **951 Chicago Avenue, Oak Park, Illinois 60302** (Frank Lloyd Wright Home and Studio), obtained a live Photon match and OSM footprint, and generated 34 surfaces from a live Commons photograph through Anthropic. All six surface kinds were present. This was actual address-driven generation, not the synthetic geometry fixture.

The source photograph is [Frank Lloyd Wright Home and Studio (west side zoom)](https://commons.wikimedia.org/wiki/File:Frank_Lloyd_Wright_Home_and_Studio_(west_side_zoom).JPG), by **John Delano of Hammond, Indiana**, under the Commons **Attribution** license. OSM building data: [way 25885716](https://www.openstreetmap.org/way/25885716), OpenStreetMap contributors, ODbL 1.0. The screenshots below show a simplified derivative of that photo and mapped information. They do not establish current conditions or survey accuracy; rear surfaces and chimney faces remain approximations.

Verified browser actions:

- Address → 3D draft → inspect photo attribution → calibrate width → Save house to layout.
- Reload and reopen: same 34 surfaces, credits and calibrated dimensions. The 56 ft width was a test calibration value, not a measured width of the building.
- Orbit exposed roof and side volumes; 480 × 800 layout kept the house form usable.
- Address change cleared the prior draft and disabled Save. An unmapped test address offered own photos without calling the model or modifying the saved house.
- Sequencer playback with two test light rows: red lights in front visible, green lights behind the walls occluded. Removing the house exposed both rows; restoring its automatic snapshot recovered the geometry and retained both light models.
- No browser console errors in the final restored state.

![Generated draft](evidence/house-model/draft.png)
![Orbit inspection](evidence/house-model/orbit.png)
![Narrow dialog](evidence/house-model/narrow.png)
![House during sequence playback](evidence/house-model/playing.png)
![House removed: both light rows visible](evidence/house-model/occlusion-control.png)
![Snapshot restored with both light models retained](evidence/house-model/restored.png)

Automated verification: 1,470 JavaScript tests (839 engine, 73 formats, 542 web, 16 tools), 178 API tests / 681 assertions, type checks, lint, and production build passed. The existing large-bundle build warning remains. Independent review and targeted tests covered authorization, malformed geometry, source licensing/hosts, camera direction, source deadlines, independent throttle buckets, generation allowance/idempotency, unmapped-photo fallback and conflicting saves. Public KartaView returned no frames at this test address; its filtering/failure paths were tested with controlled responses. Public-photo coverage elsewhere and physical accuracy are not guaranteed.

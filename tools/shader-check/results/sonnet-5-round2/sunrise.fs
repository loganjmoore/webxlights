/*{
  "DESCRIPTION": "A warm sunrise glow slowly climbs from the bottom of the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.6, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.1, 0.3, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.02, 0.02, 0.15, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 0.5 },
    { "NAME": "softness", "TYPE": "float", "MIN": 0.05, "MAX": 1.0, "DEFAULT": 0.4 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  // Position along the "rising" axis - use x for flat 1-pixel-tall rooflines,
  // y for anything with real height.
  bool isFlat = RENDERSIZE.y < 2.0;
  float pos = isFlat ? uv.x : uv.y;

  // Sunrise height oscillates 0..1..0 slowly so it rises, holds, falls, loops forever.
  float t = TIME * speed * 0.1;
  float rise = 0.5 + 0.5 * sin(t - 1.5708);

  // Distance from the horizon line to current position.
  float horizon = rise;
  float d = pos - horizon;

  // Soft gradient: below horizon glows warm, above fades to night sky.
  float glow = smoothstep(-softness, softness, -d);

  // Sun disc brightness, brightest right at the horizon line, fading with distance.
  float discFalloff = 1.0 - smoothstep(0.0, softness * 1.5, abs(d));

  vec3 skyNight = colorC.rgb;
  vec3 skyWarm = mix(colorB.rgb, colorA.rgb, clamp(pos + 0.3, 0.0, 1.0));

  vec3 col = mix(skyNight, skyWarm, glow);
  col += colorA.rgb * discFalloff * 0.6;

  gl_FragColor = vec4(col, 1.0);
}

/*{
  "DESCRIPTION": "Bright rings expanding outward from the centre one after another",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.1, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.1, 0.4, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "count", "TYPE": "float", "MIN": 1.0, "MAX": 8.0, "DEFAULT": 3.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  // Centred and aspect-corrected: a ring is a ring on a wide panel, and on a line it is a pair
  // of pulses running out from the middle.
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float t = mod(TIME * speed, 100.0);
  // A line is one pixel tall, so its "radius" is just the distance from the middle of it.
  float d = RENDERSIZE.y < 2.0 ? abs(uv.x - 0.5) * 2.0 : length(p);
  // The wave itself is what moves. 100 * 0.5 is whole, so the wrap is seamless.
  float ring = fract(d * count - t * 0.5);
  // Softer on a line, where the ring is bulbs in a row and a hard edge is a flicker.
  float aa = (RENDERSIZE.y < 2.0 ? 3.0 : 1.5) * count / max(RENDERSIZE.x, 8.0);
  float band = smoothstep(0.55 + aa, 0.55 - aa, ring) * smoothstep(0.1 - aa, 0.1 + aa, ring);
  // Alternate rings take alternate palette colours, flat, never mixed through a midpoint.
  float which = step(0.5, fract((d * count - t * 0.5) * 0.5));
  vec3 col = mix(colorA.rgb, colorB.rgb, which);
  // Fade with distance so the newest ring is the brightest, but never below what reads at night.
  float fade = 0.6 + 0.4 * (1.0 - smoothstep(0.0, 0.75, d));
  gl_FragColor = vec4(col * band * fade, 1.0);
}

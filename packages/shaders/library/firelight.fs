/*{
  "DESCRIPTION": "The warm restless flicker of firelight in deep orange and gold",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.25, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.8, 0.15, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "height", "TYPE": "float", "MIN": 0.4, "MAX": 1.5, "DEFAULT": 0.9 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float t = mod(TIME * speed, 62.831853);
  // Sums of sines rather than a hash: every frequency is a whole number of tenths, so the
  // twenty-pi wrap is seamless and nothing ever loses precision.
  float x = uv.x * 6.0;
  float y = isLine ? 0.5 : uv.y;
  float n = sin(x * 1.3 + t * 1.7) * 0.5 + sin(x * 2.9 - t * 2.3 + y * 4.0) * 0.3 + sin(y * 7.0 - t * 3.1 + x * 0.7) * 0.4;
  n = 0.5 + 0.5 * n / 1.2;
  // Hot at the bottom, dying out towards the top; on a line the whole strip is the fire's base.
  float rise = isLine ? 0.65 : clamp(1.0 - uv.y / height, 0.0, 1.0);
  float heat = clamp(rise * (0.55 + 0.9 * n), 0.0, 1.0);
  // Never dim enough to read as off: the coals always glow.
  float lit = 0.35 + 0.65 * smoothstep(0.1, 0.8, heat);
  vec3 col = mix(colorA.rgb, colorB.rgb, smoothstep(0.55, 0.85, heat));
  gl_FragColor = vec4(col * lit, 1.0);
}

/*{
  "DESCRIPTION": "Flickering fire rising from the bottom of the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.8, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.1, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 8.0, "DEFAULT": 3.0 },
    { "NAME": "intensity", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.7 }
  ]
}*/

float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  float a = hash(i);
  float b = hash(i + 1.0);
  return mix(a, b, smoothstep(0.0, 1.0, f));
}

void main() {
  vec2 uv = isf_FragNormCoord;
  bool isRoofline = RENDERSIZE.y < 2.0;

  float t = TIME * speed;

  // rising coordinate: normally y goes up, but if flat, use x instead
  float rise = isRoofline ? uv.x : uv.y;
  float across = isRoofline ? 0.5 : uv.x;

  // flame flicker noise, moving upward over time
  float n1 = noise1(across * scale * 6.0 + t * 3.0 - rise * 8.0);
  float n2 = noise1(across * scale * 12.0 - t * 5.0 - rise * 14.0 + 5.0);
  float flicker = n1 * 0.6 + n2 * 0.4;

  // base heat falls off toward the top, boosted by flicker and intensity
  float heat = (1.0 - rise) * (0.6 + 0.4 * flicker) + flicker * intensity * 0.5;
  heat = clamp(heat, 0.0, 1.0);

  // sharpen so the fire has a defined body with a flickering tip
  float body = smoothstep(0.15, 0.9, heat);

  vec3 col = mix(colorB.rgb * 0.3, colorA.rgb, body);
  col = mix(colorB.rgb, col, smoothstep(0.0, 0.35, heat));

  // slight overall pulsing brightness for extra life
  float pulse = 0.9 + 0.1 * sin(t * 6.0 + across * 20.0);
  col *= pulse;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

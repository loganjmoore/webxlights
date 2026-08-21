/*{
  "DESCRIPTION": "Slow drifting lava lamp blobs blending two colors",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.05, "MAX": 0.6, "DEFAULT": 0.25 }
  ]
}*/

float blob(vec2 uv, vec2 center, float r) {
  return r / (length(uv - center) + 0.001);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  bool flatBuffer = RENDERSIZE.y < 2.0;

  float t = TIME * speed * 0.15;

  vec2 p = uv * 2.0 - 1.0;
  p.x *= RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  p *= scale;

  float driveA = flatBuffer ? p.x : p.y;

  vec2 c1 = vec2(sin(t * 0.9) * 1.2, cos(t * 0.7) * 0.8);
  vec2 c2 = vec2(cos(t * 0.6 + 2.0) * 1.1, sin(t * 1.1 + 1.0) * 0.9);
  vec2 c3 = vec2(sin(t * 1.3 + 4.0) * 0.9, cos(t * 0.5 + 3.0) * 1.1);

  if (flatBuffer) {
    c1 = vec2(sin(t * 0.9) * 1.4, 0.0);
    c2 = vec2(cos(t * 0.6 + 2.0) * 1.3, 0.0);
    c3 = vec2(sin(t * 1.3 + 4.0) * 1.2, 0.0);
  }

  float f = blob(p, c1, 0.9) + blob(p, c2, 0.8) + blob(p, c3, 0.7);

  float edge = smoothstep(1.6 - sharpness, 1.6 + sharpness, f);
  float edge2 = smoothstep(2.6 - sharpness, 2.6 + sharpness, f);

  vec3 col = mix(colorA.rgb, colorB.rgb, edge);
  col = mix(col, colorC.rgb, edge2);

  gl_FragColor = vec4(col, 1.0);
}

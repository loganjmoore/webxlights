/*{
  "DESCRIPTION": "A saturated rainbow band sweeps sideways across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 6.0, "DEFAULT": 2.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 }
  ]
}*/
vec3 rainbow(float t) {
  float h = fract(t);
  float r = clamp(abs(h * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  float g = clamp(2.0 - abs(h * 6.0 - 2.0), 0.0, 1.0);
  float b = clamp(2.0 - abs(h * 6.0 - 4.0), 0.0, 1.0);
  return vec3(r, g, b);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  float pos = (RENDERSIZE.y < 2.0) ? uv.x : uv.x;

  float hue = pos * scale - TIME * speed * 0.3;
  vec3 col = rainbow(hue);

  float boost = mix(1.0, 1.8, sharpness);
  col = clamp((col - 0.5) * boost + 0.5, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}

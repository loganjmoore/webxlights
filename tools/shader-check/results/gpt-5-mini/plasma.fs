/*{
  "DESCRIPTION": "Swirling plasma for Christmas lights",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.2, "MAX": 6.0, "DEFAULT": 2.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  // center and aspect-correct
  vec2 p = uv - vec2(0.5, 0.5);
  p.x *= aspect;
  // If this is a roofline (very short height), drive the animation along X
  if (RENDERSIZE.y < 2.0) {
    float x = uv.x - 0.5;
    p = vec2(x * aspect, x);
  }
  float t = TIME * speed;
  // polar coordinates for swirling
  float angle = atan(p.y, p.x);
  float radius = length(p) * scale;
  // layered swirling/plasma terms
  float swirl = angle + 1.5 * sin(radius * 3.0 - t * 0.5);
  float term1 = sin(swirl * 3.0 + t);
  float term2 = sin(radius * 6.0 - t * 0.8 + cos(p.x * 5.0 + t * 0.3));
  float term3 = sin(p.x * 10.0 + p.y * 7.0 + t * 0.6);
  float combined = (term1 + term2 + term3) * 0.3333333;
  float val = 0.5 + 0.5 * sin(combined * 3.14159265 + t * 0.2);
  // tighten contrast for bright holiday lights
  val = pow(abs(val), 0.9);
  // palette blend between three user colors
  float a = smoothstep(0.0, 0.5, val);
  float b = smoothstep(0.5, 1.0, val);
  vec3 col = mix(colorA.rgb, colorB.rgb, a);
  col = mix(col, colorC.rgb, b);
  // add a soft radial glow and subtle pulsing
  float glow = 0.6 / (0.2 + radius * radius * 6.0);
  col += glow * (0.5 + 0.5 * sin(t + radius * 8.0)) * vec3(1.0);
  // clamp and output opaque color
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}

/*{
  "DESCRIPTION": "Fire rising from the bottom with flickering red and orange flames",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorHot", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorCool", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/

float hash(float x) {
  return fract(sin(x * 73.156) * 43758.5453);
}

float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), u);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float y = uv.y;
  float x = uv.x;
  
  float t = TIME * speed;
  float baseFlame = noise(x * scale * 3.0 + t * 0.7) * 0.5 + noise(x * scale * 7.0 + t * 1.3) * 0.3;
  
  float flameHeight = y - baseFlame * 0.4;
  float flameIntensity = 1.0 - flameHeight * 1.2;
  flameIntensity = max(0.0, flameIntensity);
  flameIntensity *= flameIntensity;
  
  float flicker = noise(x * 2.0 + t * 3.5) * 0.3 + 0.7;
  flameIntensity *= flicker;
  
  vec3 col = mix(colorCool.rgb, colorHot.rgb, flameIntensity * 0.8);
  col *= flameIntensity;
  
  gl_FragColor = vec4(col, 1.0);
}

/*{
  "DESCRIPTION": "Fire rising from the bottom with flickering flames",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorBase", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorTip", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "intensity", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 1.0 }
  ]
}*/

float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), f);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  float aspectRatio = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  
  vec2 fireUv = uv;
  if (RENDERSIZE.y < 2.0) {
    fireUv = vec2(uv.y * aspectRatio, uv.x);
  }
  
  float yPos = fireUv.y;
  float xPos = fireUv.x;
  
  float rise = fract(TIME * speed * 0.5 - yPos);
  float flicker = noise(xPos * 8.0 + TIME * speed * 2.0) * 0.5 + 0.5;
  float wobble = sin(xPos * 3.14159 + TIME * speed) * 0.1 + 0.5;
  
  float fireNoise = noise(xPos * 4.0 + rise * 3.0) * flicker * wobble;
  float flameMask = smoothstep(0.0, 0.4, yPos) * smoothstep(1.2, 0.3, yPos + rise);
  flameMask = flameMask * (fireNoise + 0.3);
  
  float gradient = smoothstep(0.0, 1.0, yPos);
  vec3 fireColor = mix(colorBase.rgb, colorTip.rgb, gradient);
  
  vec3 finalColor = fireColor * flameMask * intensity;
  
  gl_FragColor = vec4(finalColor, 1.0);
}

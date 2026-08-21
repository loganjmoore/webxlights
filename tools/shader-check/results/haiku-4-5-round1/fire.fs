/*{
  "DESCRIPTION": "Fire rising from the bottom with flickering flames and warm colors",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorBase", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.0, 1.0] },
    { "NAME": "colorTip", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "height", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 1.0 },
    { "NAME": "turbulence", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 1.0 }
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
  
  float fireHeight = uv.y * height;
  float time = TIME * speed * 0.5;
  
  float flicker = noise(fireHeight * 3.0 + time);
  float wave = sin(fireHeight * 6.28 + time) * 0.3;
  float turbulenceNoise = noise(uv.x * 8.0 + time * turbulence) * 0.4;
  
  float distortion = wave + turbulenceNoise + flicker * 0.3;
  float shimmer = noise(uv.x * 4.0 - fireHeight * 2.0 + time * 1.5) * 0.5 + 0.5;
  
  float fireMask = 1.0 - fireHeight;
  fireMask = smoothstep(0.0, 0.7, fireMask - abs(distortion) * 0.5);
  fireMask *= shimmer;
  
  vec3 fireColor = mix(colorBase.rgb, colorTip.rgb, fireHeight);
  fireColor *= (1.0 + flicker * 0.4);
  
  gl_FragColor = vec4(fireColor * fireMask, 1.0);
}

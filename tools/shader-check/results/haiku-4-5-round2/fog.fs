/*{
  "DESCRIPTION": "Spooky green fog drifting across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "fogColor", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.2, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.1, "MAX": 3.0, "DEFAULT": 1.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 5.0, "DEFAULT": 2.0 }
  ]
}*/

float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), f);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float fogEffect = 0.0;
  float baseFreq = scale;
  float amp = 1.0;
  
  for(int i = 0; i < 4; i++) {
    float freq = baseFreq * pow(2.0, float(i));
    float noiseSample = noise(uv.x * freq + TIME * speed * 0.5 - float(i) * 0.3);
    fogEffect += noiseSample * amp;
    amp *= 0.5;
  }
  
  fogEffect = pow(fogEffect * density, 0.8);
  fogEffect = clamp(fogEffect, 0.0, 1.0);
  
  float verticalGradient = smoothstep(1.2, -0.2, uv.y);
  fogEffect *= verticalGradient;
  
  vec3 finalColor = mix(vec3(0.0, 0.0, 0.0), fogColor.rgb, fogEffect);
  
  gl_FragColor = vec4(finalColor, 1.0);
}

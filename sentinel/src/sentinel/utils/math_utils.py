import numpy as np

def diag_gaussian_pdf(x, mu, sigma):
    """
    Computes the PDF of a diagonal Gaussian.
    """
    d = len(x)
    det = np.prod(sigma)
    if det == 0:
        return 0.0
    norm_const = 1.0 / (np.power((2 * np.pi), d / 2) * np.sqrt(det))
    x_mu = x - mu
    result = np.exp(-0.5 * np.sum((x_mu ** 2) / sigma))
    return norm_const * result

def safe_normalize(probs):
    """
    Normalizes a probability array safely.
    """
    s = np.sum(probs)
    if s == 0:
        return np.ones(len(probs)) / len(probs)
    return probs / s

def is_nan(val):
    """
    Checks if a value is NaN.
    """
    return val is None or np.isnan(val)
